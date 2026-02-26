import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, HTTPException, Depends

from models import FolderCreate, FolderRename, FolderDelete, FolderMove, FolderOrderUpdate
from services.database import get_db
from services.auth import get_current_user
from services.storage import r2_client, R2_BUCKET_NAME
from services.cache import get_cached, set_cached, invalidate_cache
from utils import safe_deck_name as _safe_deck_name

router = APIRouter()

# Cache TTL in seconds
CACHE_TTL = 30


# ---------------------------------------------------------------------------
# ALL folder CRUD is Supabase-first, scoped to the requesting user_id.
# The old R2-based index.json approach was a single global shared file —
# meaning every user saw and modified the same folder list. That's gone.
# ---------------------------------------------------------------------------


@router.get("/folders")
def get_folders(user_id: str = Depends(get_current_user)):
    """Return all folders for the current user with deck counts, sorted by order_index."""
    try:
        db = get_db()

        # Fetch this user's folders from Supabase sorted by order_index
        folders_res = db.table("folders").select("*").eq("user_id", user_id).order("order_index").execute()
        folders_data = folders_res.data or []

        # Fetch this user's decks to compute per-folder counts
        decks_res = db.table("decks").select("folder_id").eq("user_id", user_id).execute()
        decks_data = decks_res.data or []

        # Count decks per folder_id
        counts = {}
        for d in decks_data:
            fid = d.get("folder_id")
            if fid:
                counts[fid] = counts.get(fid, 0) + 1

        ordered = []
        for f in folders_data:
            name = f.get("name", "")
            ordered.append({
                "name": name,
                "count": counts.get(name, 0),
                "parent": f.get("parent_id"),
            })

        return {"folders": ordered}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.get("/folder")
def get_folder(name: str, user_id: str = Depends(get_current_user)):
    """Return a single folder's details for the current user."""
    try:
        db = get_db()
        result = db.table("folders").select("*").eq("name", name).eq("user_id", user_id).execute()
        if not result.data:
            return {"name": name, "parent": None, "count": 0}
        f = result.data[0]

        # Count decks in this folder
        decks_res = db.table("decks").select("id").eq("folder_id", name).eq("user_id", user_id).execute()
        count = len(decks_res.data or [])

        return {"name": f.get("name"), "parent": f.get("parent_id"), "count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.post("/folder/create")
def folder_create(payload: FolderCreate, user_id: str = Depends(get_current_user)):
    name = _safe_deck_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Folder name required")

    try:
        db = get_db()
        # Check if already exists for this user
        existing = db.table("folders").select("id").eq("name", name).eq("user_id", user_id).execute()
        if not existing.data:
            # Get max order_index to append
            max_res = db.table("folders").select("order_index").eq("user_id", user_id).order("order_index", desc=True).limit(1).execute()
            next_idx = (max_res.data[0]["order_index"] + 1) if max_res.data else 0
            
            db.table("folders").insert({
                "name": name,
                "user_id": user_id,
                "order_index": next_idx
            }).execute()
        invalidate_cache(f"folders:{user_id}")
        return {"ok": True, "name": name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.post("/folder/rename")
def folder_rename(payload: FolderRename, user_id: str = Depends(get_current_user)):
    old = _safe_deck_name(payload.old_name)
    new = _safe_deck_name(payload.new_name)
    if not old or not new:
        raise HTTPException(status_code=400, detail="Folder name required")

    try:
        db = get_db()
        # Rename folder in Supabase (scoped to user)
        db.table("folders").update({"name": new}).eq("name", old).eq("user_id", user_id).execute()

        # Update parent_id references (child folders that pointed to old name)
        db.table("folders").update({"parent_id": new}).eq("parent_id", old).eq("user_id", user_id).execute()

        # Update folder_id on decks belonging to this user
        db.table("decks").update({"folder_id": new}).eq("folder_id", old).eq("user_id", user_id).execute()

        invalidate_cache(f"folders:{user_id}")
        return {"ok": True, "old_name": old, "new_name": new}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.delete("/folder/delete")
def folder_delete(payload: FolderDelete, user_id: str = Depends(get_current_user)):
    name = _safe_deck_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Folder name required")

    try:
        db = get_db()
        # Remove folder (scoped to user)
        db.table("folders").delete().eq("name", name).eq("user_id", user_id).execute()

        # Move decks in this folder back to root (null folder)
        db.table("decks").update({"folder_id": None}).eq("folder_id", name).eq("user_id", user_id).execute()

        # Detach any child folders from this parent
        db.table("folders").update({"parent_id": None}).eq("parent_id", name).eq("user_id", user_id).execute()

        invalidate_cache(f"folders:{user_id}")
        return {"ok": True, "deleted": name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.post("/folder/move")
def folder_move(payload: FolderMove, user_id: str = Depends(get_current_user)):
    """Set a folder's parent (nested folders)."""
    name = _safe_deck_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Folder name required")
    parent = _safe_deck_name(payload.parent) if payload.parent else None

    if parent and parent == name:
        raise HTTPException(status_code=400, detail="Cannot move folder into itself")

    try:
        db = get_db()
        db.table("folders").update({"parent_id": parent}).eq("name", name).eq("user_id", user_id).execute()
        invalidate_cache(f"folders:{user_id}")
        return {"ok": True, "name": name, "parent": parent}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.get("/order/folders")
def order_folders_get(user_id: str = Depends(get_current_user)):
    """Return folder names in order for the current user (from Supabase)."""
    try:
        db = get_db()
        result = db.table("folders").select("name").eq("user_id", user_id).order("order_index").execute()
        names = [f["name"] for f in (result.data or []) if f.get("name")]
        return names
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.post("/order/folders")
def order_folders_set(payload: FolderOrderUpdate, user_id: str = Depends(get_current_user)):
    """Set the order_index for folders based on drag-and-drop order."""
    try:
        db = get_db()
        names = [ _safe_deck_name(x) for x in (payload.order or []) if _safe_deck_name(x) ]
        
        for idx, name in enumerate(names):
            db.table("folders").update({"order_index": idx}).eq("name", name).eq("user_id", user_id).execute()
            
        invalidate_cache(f"folders:{user_id}")
        return {"ok": True, "order": names}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

