import csv
import io
import json
import threading
import asyncio
from typing import List

from fastapi import APIRouter, HTTPException, Depends
from gtts import gTTS  # kept for TTS fallback in inline deck audio preview
from botocore.exceptions import ClientError

from services.database import get_db
from services.auth import get_current_user
from models import DeckCreate, DeckUpdate, DeckDelete, DeckRename, DeckMove, DeckOrderUpdate
from services.storage import (
    r2_client, R2_BUCKET_NAME
)
from services.audio import background_audio_generation, background_audio_cleanup_and_generate, _safe_tts_key_helper, _safe_tts_key_helper as _safe_tts_key
from services.cache import invalidate_cache, get_cached, set_cached
from services.executor import get_executor
from services.deck_service import get_cards as get_cards_from_service
from utils import safe_deck_name as _safe_deck_name

router = APIRouter()

# Cache TTL for deck order (in seconds)
DECK_ORDER_CACHE_TTL = 30

@router.get("/decks")
def list_decks(user_id: str = Depends(get_current_user)):
    """List decks for the authenticated user only.
    On first login, copies template decks to this user automatically.
    """
    try:
        db = get_db()

        # Check if this user already has their own decks
        user_decks = db.table("decks").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()

        # --- STARTER PACK: First time this user logs in ---
        if not user_decks.data:
            # Get all template decks (user_id is NULL = templates)
            templates = db.table("decks").select("*").is_("user_id", "null").execute()

            if templates.data:
                # Copy each template deck and assign it to this user
                new_rows = []
                for t in templates.data:
                    new_rows.append({
                        "name": t["name"],
                        "r2_key": t["r2_key"],       # Same file in Cloudflare — no duplication!
                        "folder_id": t.get("folder_id"),
                        "user_id": user_id
                    })

                if new_rows:
                    db.table("decks").insert(new_rows).execute()

                # Also copy folder structure for this user
                template_folders = db.table("folders").select("*").is_("user_id", "null").execute()
                if template_folders.data:
                    folder_rows = []
                    for f in template_folders.data:
                        folder_rows.append({
                            "name": f["name"],
                            "parent_id": f.get("parent_id"),
                            "user_id": user_id
                        })
                    if folder_rows:
                        db.table("folders").insert(folder_rows).execute()

            # Re-fetch the now-populated user decks
            user_decks = db.table("decks").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()

        # Format for frontend
        items = []
        for d in user_decks.data:
            items.append({
                "id": d.get("id"),
                "name": d.get("name"),
                "file": d.get("r2_key"),
                "last_modified": d.get("created_at"),
                "folder": d.get("folder_id")
            })
        return items

    except Exception as e:
        print(f"Error listing decks from DB: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

@router.get("/cards")
def get_cards(deck: str = "list", user_id: str = Depends(get_current_user)):
    """Fetch cards for a deck from the database."""
    return get_cards_from_service(deck, user_id)

@router.get("/deck/csv")
def get_deck_csv(deck: str, user_id: str = Depends(get_current_user)):
    """Return raw CSV content for an existing deck from R2."""
    safe = _safe_deck_name(deck)
    if not safe:
        raise HTTPException(status_code=400, detail="Invalid deck name")
    if not r2_client or not R2_BUCKET_NAME:
        raise HTTPException(status_code=400, detail="Cloudflare R2 is not configured")
    key = f"{R2_BUCKET_NAME}/csv/{safe}.csv"
    try:
        obj = r2_client.get_object(Bucket=R2_BUCKET_NAME, Key=key)
        data = obj["Body"].read().decode("utf-8")
        return {"name": safe, "file": key, "csv": data}
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey", "NotFound"):
            raise HTTPException(status_code=404, detail="Deck not found")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/deck/create")
def create_deck(payload: DeckCreate, user_id: str = Depends(get_current_user)):
    """Create a new deck and save metadata to Supabase."""
    if not r2_client or not R2_BUCKET_NAME:
        raise HTTPException(status_code=400, detail="Cloudflare R2 is not configured")

    name = _safe_deck_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Deck name required")

    rows = []
    for line in payload.data.splitlines():
        parts = [p.strip() for p in line.split(",", 1)]
        if len(parts) == 2 and all(parts):
            rows.append(parts)

    if not rows:
        raise HTTPException(status_code=400, detail="No valid rows found")

    # 1. Upload CSV to R2 (Storage)
    r2_csv_key = f"{R2_BUCKET_NAME}/csv/{name}.csv"
    try:
        buf = io.StringIO()
        csv.writer(buf).writerows(rows)
        data_bytes = buf.getvalue().encode("utf-8")
        r2_client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=r2_csv_key,
            Body=data_bytes,
            ContentType="text/csv",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload deck CSV: {e}")

    # 2. Save Metadata to Supabase (Database)
    db_updated = False
    db_error = None
    try:
        db = get_db()
        # Check if this user already has a deck with this name (scoped to user)
        folder_id = _safe_deck_name(payload.folder) if payload.folder else None
        existing = db.table("decks").select("id").eq("name", name).eq("user_id", user_id).execute()

        if existing.data:
            # Update existing deck belonging to this user
            db.table("decks").update({
                "r2_key": r2_csv_key,
                "folder_id": folder_id
            }).eq("name", name).eq("user_id", user_id).execute()
        else:
            # Insert new deck for this user
            db.table("decks").insert({
                "name": name,
                "r2_key": r2_csv_key,
                "folder_id": folder_id,
                "user_id": user_id
            }).execute()
        db_updated = True
    except Exception as e:
        db_error = str(e)
        print(f"Database error during creation: {e}")

    # 3. Start background audio generation (non-blocking)
    de_words = [de for _, de in rows]
    background_audio_generation(de_words)

    # Invalidate caches
    folder_scope = _safe_deck_name(payload.folder) if payload.folder else "root"
    invalidate_cache(f"decks:order:{folder_scope}")
    invalidate_cache("folders:")

    return {
        "ok": True,
        "name": name,
        "db_updated": db_updated,
        "db_error": db_error,
        "audio_status": "generating_in_background"
    }

@router.post("/deck/update")
def update_deck(payload: DeckUpdate, user_id: str = Depends(get_current_user)):
    """Update an existing deck's CSV content in R2."""
    if not r2_client or not R2_BUCKET_NAME:
        raise HTTPException(status_code=400, detail="Cloudflare R2 is not configured")
    name = _safe_deck_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Deck name required")
    content = payload.content or ""
    key = f"{R2_BUCKET_NAME}/csv/{name}.csv"

    # Read old CSV to compute changes
    old_csv = ""
    try:
        obj_old = r2_client.get_object(Bucket=R2_BUCKET_NAME, Key=key)
        old_csv = obj_old["Body"].read().decode("utf-8")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code not in ("404", "NoSuchKey", "NotFound"):
            raise HTTPException(status_code=500, detail=str(e))

    try:
        r2_client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=key,
            Body=content.encode("utf-8"),
            ContentType="text/csv",
        )
        # Compute German word changes
        def parse_de_words(csv_text: str):
            words = set()
            try:
                reader = csv.reader(io.StringIO(csv_text))
                for row in reader:
                    if len(row) >= 2:
                        de = row[1].strip()
                        if de:
                            words.add(de)
            except Exception:
                pass
            return words

        old_de = parse_de_words(old_csv)
        new_de = parse_de_words(content)
        to_delete = old_de - new_de
        to_generate = new_de - old_de

        # Start background audio cleanup and generation (non-blocking)
        if to_delete or to_generate:
            thread = threading.Thread(
                target=background_audio_cleanup_and_generate, 
                args=(to_delete, to_generate), 
                daemon=True
            )
            thread.start()

        rows_count = sum(1 for line in content.splitlines() if "," in line)
        return {
            "ok": True,
            "r2_bucket": R2_BUCKET_NAME,
            "r2_csv_key": key,
            "rows": rows_count,
            "audio_status": "processing_in_background",
            "words_to_delete": len(to_delete),
            "words_to_generate": len(to_generate),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update deck CSV: {e}")

@router.delete("/deck/delete")
def delete_deck(payload: DeckDelete, user_id: str = Depends(get_current_user)):
    if not r2_client or not R2_BUCKET_NAME:
        raise HTTPException(status_code=400, detail="Cloudflare R2 is not configured")
    name = _safe_deck_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Deck name required")
    csv_key = f"{R2_BUCKET_NAME}/csv/{name}.csv"

    # 1. Read CSV words for audio cleanup
    de_words = []
    try:
        obj = r2_client.get_object(Bucket=R2_BUCKET_NAME, Key=csv_key)
        data = obj["Body"].read().decode("utf-8")
        reader = csv.reader(io.StringIO(data))
        for row in reader:
            if len(row) >= 2:
                de = row[1].strip()
                if de:
                    de_words.append(de)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code not in ("404", "NoSuchKey", "NotFound"):
            raise HTTPException(status_code=500, detail=str(e))

    # 2. Delete audio files in background
    audio_count = len(de_words)
    if de_words:
        def _delete_audio():
            for w in de_words:
                try:
                    r2_client.delete_object(Bucket=R2_BUCKET_NAME, Key=_safe_tts_key_helper(w, "de"))
                except Exception:
                    pass
        threading.Thread(target=_delete_audio, daemon=True).start()

    # 3. Delete the CSV file from Cloudflare R2
    csv_deleted = False
    try:
        r2_client.delete_object(Bucket=R2_BUCKET_NAME, Key=csv_key)
        csv_deleted = True
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code not in ("404", "NoSuchKey", "NotFound"):
            raise HTTPException(status_code=500, detail=str(e))

    # 4. Delete the record from Supabase (scoped to this user only)
    db_deleted = False
    try:
        db = get_db()
        db.table("decks").delete().eq("name", name).eq("user_id", user_id).execute()
        db_deleted = True
    except Exception as e:
        print(f"Warning: Supabase delete failed for '{name}': {e}")

    # Invalidate caches
    invalidate_cache("decks:order:")
    invalidate_cache("folders:")

    return {
        "ok": True,
        "csv_deleted": csv_deleted,
        "db_deleted": db_deleted,
        "audio_status": "deleting_in_background",
        "audio_count": audio_count,
    }

@router.post("/deck/rename")
def rename_deck(payload: DeckRename, user_id: str = Depends(get_current_user)):
    if not r2_client or not R2_BUCKET_NAME:
        raise HTTPException(status_code=400, detail="Cloudflare R2 is not configured")
    old = _safe_deck_name(payload.old_name)
    new = _safe_deck_name(payload.new_name)
    if not old or not new:
        raise HTTPException(status_code=400, detail="Deck name required")
    if old == new:
        raise HTTPException(status_code=400, detail="New name must be different")
    old_key = f"{R2_BUCKET_NAME}/csv/{old}.csv"
    new_key = f"{R2_BUCKET_NAME}/csv/{new}.csv"

    # 1. Check target doesn't already exist in R2
    try:
        r2_client.head_object(Bucket=R2_BUCKET_NAME, Key=new_key)
        raise HTTPException(status_code=400, detail="Target deck already exists")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code not in ("404", "NoSuchKey", "NotFound"):
            raise HTTPException(status_code=500, detail=str(e))

    # 2. Copy the CSV to new key, delete the old one in Cloudflare R2
    try:
        obj = r2_client.get_object(Bucket=R2_BUCKET_NAME, Key=old_key)
        content = obj["Body"].read()
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey", "NotFound"):
            raise HTTPException(status_code=404, detail="Deck not found")
        raise HTTPException(status_code=500, detail=str(e))
    try:
        r2_client.put_object(Bucket=R2_BUCKET_NAME, Key=new_key, Body=content, ContentType="text/csv")
        r2_client.delete_object(Bucket=R2_BUCKET_NAME, Key=old_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rename file in R2: {e}")

    # 3. Update the record in Supabase (scoped to this user only)
    db_updated = False
    try:
        db = get_db()
        db.table("decks").update({
            "name": new,
            "r2_key": new_key
        }).eq("name", old).eq("user_id", user_id).execute()
        db_updated = True
    except Exception as e:
        print(f"Warning: Supabase rename failed for '{old}' -> '{new}': {e}")

    # Invalidate caches
    invalidate_cache("decks:order:")
    invalidate_cache("folders:")

    return {"ok": True, "old_name": old, "new_name": new, "db_updated": db_updated}

@router.post("/deck/move")
def deck_move(payload: DeckMove, user_id: str = Depends(get_current_user)):
    """Move a deck to a different folder in the database."""
    from services.database import get_db
    db = get_db()
    
    name = _safe_deck_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Deck name required")
    folder_name = _safe_deck_name(payload.folder) if payload.folder else None
    
    try:
        # 1. Resolve folder_name to folder_id
        folder_id = None
        if folder_name:
            folder_res = db.table("folders").select("id").eq("user_id", user_id).eq("name", folder_name).execute()
            if folder_res.data:
                folder_id = folder_res.data[0]["id"]
            else:
                # If folder doesn't exist, create it (legacy behavior compatibility)
                ins = db.table("folders").insert({"user_id": user_id, "name": folder_name}).execute()
                if ins.data:
                    folder_id = ins.data[0]["id"]

        # 2. Update the deck's folder_id
        db.table("decks").update({"folder_id": folder_id}).eq("name", name).eq("user_id", user_id).execute()
        
        # 3. Invalidate caches
        invalidate_cache("folders:")
        invalidate_cache(f"decks:order:{user_id}:root")
        if folder_name:
            invalidate_cache(f"decks:order:{user_id}:{folder_name}")
            
        return {"ok": True, "name": name, "folder": folder_name}
        
    except Exception as e:
        print(f"Error moving deck: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/preload_deck_audio")
async def preload_deck_audio(deck: str, lang: str = "de", user_id: str = Depends(get_current_user)):
    """Preload all audio files for a deck and return URLs with concurrent processing."""
    if not r2_client or not R2_BUCKET_NAME:
        raise HTTPException(status_code=400, detail="Cloudflare R2 is not configured")
    
    # Get deck data
    safe = _safe_deck_name(deck)
    if not safe:
        raise HTTPException(status_code=400, detail="Invalid deck name")
    
    try:
        # Get deck cards - duplicated local logic to avoid circular import issues with get_cards
        cards = []
        if r2_client and R2_BUCKET_NAME:
            csv_key = f"{R2_BUCKET_NAME}/csv/{safe}.csv"
            try:
                obj = r2_client.get_object(Bucket=R2_BUCKET_NAME, Key=csv_key)
                data = obj["Body"].read().decode("utf-8")
                reader = csv.reader(io.StringIO(data))
                for row in reader:
                    if len(row) >= 2:
                        en, de = row[0].strip(), row[1].strip()
                        if de:
                            cards.append({"de": de, "en": en})
            except Exception:
                pass

        # Process all audio files concurrently
        async def process_audio_file(card):
            """Process a single audio file asynchronously."""
            text = card["de"]
            key = _safe_tts_key(text, lang)
            
            def check_and_generate():
                try:
                    # Check if exists
                    r2_client.head_object(Bucket=R2_BUCKET_NAME, Key=key)
                    return text, f"/r2/get?key={key}"
                except ClientError:
                    # Generate and upload if not exists
                    try:
                        from services.tts import tts_service
                        audio_bytes = tts_service.generate(text=text, lang=lang)
                        r2_client.put_object(
                            Bucket=R2_BUCKET_NAME,
                            Key=key,
                            Body=audio_bytes,
                            ContentType="audio/mpeg",
                        )
                        return text, f"/r2/get?key={key}"
                    except Exception:
                        return None, None
            
            # Run the blocking operation in a thread pool
            executor = get_executor()
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(executor, check_and_generate)
            return result
        
        # Process all cards concurrently (limit to 10 concurrent operations)
        semaphore = asyncio.Semaphore(10)
        
        async def process_with_semaphore(card):
            async with semaphore:
                return await process_audio_file(card)
        
        # Execute all tasks concurrently
        tasks = [process_with_semaphore(card) for card in cards]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Build audio_urls from results
        audio_urls = {}
        for result in results:
            if isinstance(result, Exception):
                continue  # Skip failed operations
            text, url = result
            if text and url:
                audio_urls[text] = url
        
        return {"audio_urls": audio_urls}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to preload deck audio: {str(e)}")

@router.get("/order/decks")
def order_decks_get(scope: str | None = None, user_id: str = Depends(get_current_user)):
    """Get the list of decks in a specific folder, sorted by their database order_index."""
    db = get_db()
    safe_scope = _safe_deck_name((scope or "root")) or "root"
    
    # Check cache (user-scoped)
    cache_key = f"decks:order:{user_id}:{safe_scope}"
    cached = get_cached(cache_key, DECK_ORDER_CACHE_TTL)
    if cached is not None:
        return cached

    try:
        # 1. Find the folder ID for the scope
        folder_id = None
        if safe_scope != "root":
            folder_res = db.table("folders").select("id").eq("name", safe_scope).eq("user_id", user_id).execute()
            if folder_res.data:
                folder_id = folder_res.data[0]["id"]
            else:
                return [] # Folder doesn't exist

        # 2. Fetch decks in that folder, sorted by order_index
        query = db.table("decks").select("name").eq("user_id", user_id)
        if folder_id:
            query = query.eq("folder_id", folder_id)
        else:
            query = query.is_("folder_id", "null")
            
        decks_res = query.order("order_index").execute()
        
        names = [d["name"] for d in decks_res.data]
        set_cached(cache_key, names)
        return names

    except Exception as e:
        print(f"Error fetching deck order: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/order/decks")
def order_decks_set(payload: DeckOrderUpdate, user_id: str = Depends(get_current_user)):
    """Update the 'order_index' for multiple decks in the database."""
    db = get_db()
    scope = _safe_deck_name((payload.scope or "root")) or "root"
    names = [ _safe_deck_name(x) for x in (payload.order or []) if _safe_deck_name(x) ]
    
    try:
        # Update each deck's order_index based on its position in the payload list
        for idx, name in enumerate(names):
            db.table("decks").update({"order_index": idx}).eq("user_id", user_id).eq("name", name).execute()
        
        # Invalidate user-scoped cache
        invalidate_cache(f"decks:order:{user_id}:{scope}")
        return {"ok": True, "scope": scope, "order": names}
    except Exception as e:
        print(f"Error updating deck order in DB: {e}")
        raise HTTPException(status_code=500, detail=str(e))
