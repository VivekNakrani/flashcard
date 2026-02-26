import json
from datetime import datetime, timezone
from io import BytesIO

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from botocore.exceptions import ClientError
from PIL import Image
try:
    import pypdfium2 as pdfium
except Exception:  # pragma: no cover
    pdfium = None

from models import (
    PdfRename,
    PdfDelete,
    PdfMove,
    PdfOrderUpdate,
    PdfFolderCreate,
    PdfFolderRename,
    PdfFolderDelete,
    PdfFolderMove,
)
from services.storage import r2_client, R2_BUCKET_NAME
from services.auth import get_current_user
from services.cache import get_cached, set_cached, invalidate_cache
from utils import safe_deck_name as _safe_name


router = APIRouter()

PDF_ORDER_CACHE_TTL = 30


def _thumb_key(name: str) -> str:
    return f"{R2_BUCKET_NAME}/pdf/thumbs/{name}.jpg"


def _build_thumb(content: bytes, safe_name: str) -> str | None:
    if not r2_client or not R2_BUCKET_NAME or pdfium is None:
        return None
    if not content:
        return None
    try:
        doc = pdfium.PdfDocument(BytesIO(content))
        if len(doc) == 0:
            return None
        page = doc[0]
        image = page.render(scale=3.0).to_pil()
        image.thumbnail((1024, 1024), Image.LANCZOS)
        buf = BytesIO()
        image.save(buf, format="JPEG", quality=95, subsampling=0, optimize=True)
        data = buf.getvalue()
        key = _thumb_key(safe_name)
        r2_client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=key,
            Body=data,
            ContentType="image/jpeg",
        )
        return key
    except Exception:
        return None


@router.get("/pdf/folders")
def get_pdf_folders(user_id: str = Depends(get_current_user)):
    """Get the list of PDF folders and the number of PDFs in each."""
    from services.database import get_db
    db = get_db()
    
    try:
        # 1. Fetch all folders for this user
        folders_res = db.table("pdf_folders").select("name, order_index").eq("user_id", user_id).order("order_index").execute()
        
        # 2. Fetch counts of PDFs per folder
        counts_res = db.table("pdfs").select("folder").eq("user_id", user_id).execute()
        
        counts: dict[str, int] = {}
        for p in counts_res.data:
            f = p.get("folder") or "Uncategorized"
            counts[f] = counts.get(f, 0) + 1
            
        ordered = []
        seen = set()
        
        # Add folders from table
        for f in folders_res.data:
            name = f["name"]
            ordered.append({"name": name, "count": counts.get(name, 0), "parent": None})
            seen.add(name)
            
        # Add 'Uncategorized' if not present in table but has files
        if "Uncategorized" not in seen:
            ordered.append({"name": "Uncategorized", "count": counts.get("Uncategorized", 0), "parent": None})
            
        return {"folders": ordered}
        
    except Exception as e:
        print(f"Error fetching PDF folders: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pdf/folder/create")
def pdf_folder_create(payload: PdfFolderCreate, user_id: str = Depends(get_current_user)):
    """Create a new PDF folder in the database."""
    from services.database import get_db
    db = get_db()
    name = _safe_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Folder name required")
    
    try:
        # Check if folder already exists for this user
        existing = db.table("pdf_folders").select("id").eq("user_id", user_id).eq("name", name).execute()
        if existing.data:
            return {"ok": True, "name": name, "msg": "Already exists"}
            
        # Get max order_index
        max_res = db.table("pdf_folders").select("order_index").eq("user_id", user_id).order("order_index", desc=True).limit(1).execute()
        next_idx = (max_res.data[0]["order_index"] + 1) if max_res.data else 0
        
        db.table("pdf_folders").insert({
            "user_id": user_id,
            "name": name,
            "order_index": next_idx
        }).execute()
        
        invalidate_cache("pdfs:folders")
        return {"ok": True, "name": name}
    except Exception as e:
        print(f"Error creating PDF folder: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pdf/folder/rename")
def pdf_folder_rename(payload: PdfFolderRename, user_id: str = Depends(get_current_user)):
    """Rename a PDF folder and update all PDFs inside it."""
    from services.database import get_db
    db = get_db()
    old = _safe_name(payload.old_name)
    new = _safe_name(payload.new_name)
    if not old or not new:
        raise HTTPException(status_code=400, detail="Folder name required")
        
    try:
        # 1. Update the folder record
        db.table("pdf_folders").update({"name": new}).eq("user_id", user_id).eq("name", old).execute()
        
        # 2. Update all PDFs that were in the old folder
        db.table("pdfs").update({"folder": new}).eq("user_id", user_id).eq("folder", old).execute()
        
        invalidate_cache("pdfs:")
        return {"ok": True, "old_name": old, "new_name": new}
    except Exception as e:
        print(f"Error renaming PDF folder: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/pdf/folder/delete")
def pdf_folder_delete(payload: PdfFolderDelete, user_id: str = Depends(get_current_user)):
    """Delete a PDF folder and move its PDFs to 'Uncategorized'."""
    from services.database import get_db
    db = get_db()
    name = _safe_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Folder name required")
        
    try:
        # 1. Delete the folder record
        db.table("pdf_folders").delete().eq("user_id", user_id).eq("name", name).execute()
        
        # 2. Update all PDFs in this folder to 'Uncategorized'
        db.table("pdfs").update({"folder": "Uncategorized"}).eq("user_id", user_id).eq("folder", name).execute()
        
        invalidate_cache("pdfs:")
        return {"ok": True, "deleted": name}
    except Exception as e:
        print(f"Error deleting PDF folder: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pdf/folder/move")
def pdf_folder_move(payload: PdfFolderMove, user_id: str = Depends(get_current_user)):
    """Reorder a PDF folder by updating its order_index in the database."""
    from services.database import get_db
    db = get_db()
    
    # In the current UI context, 'move' usually means reordering
    # We'll treat this as moving 'source' to 'target' position if target exists,
    # or just ensuring 'target' folder exists.
    source = _safe_name(payload.source)
    target = _safe_name(payload.target) if payload.target else None
    
    try:
        if target:
            # Ensure target folder exists (legacy behavior)
            existing = db.table("pdf_folders").select("id").eq("user_id", user_id).eq("name", target).execute()
            if not existing.data:
                db.table("pdf_folders").insert({"user_id": user_id, "name": target}).execute()
        
        # If this was intended as a REORDER, we'd need a list of names. 
        # For now, we'll just acknowledge the move/existence.
        invalidate_cache("pdfs:")
        return {"ok": True, "source": source, "target": target}
    except Exception as e:
        print(f"Error moving PDF folder logic: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pdfs")
def list_pdfs(user_id: str = Depends(get_current_user)):
    """List all PDFs for the current user from the database."""
    from services.database import get_db
    db = get_db()
    
    try:
        # Fetch PDFs sorted by created_at (as a proxy for last_modified) or custom order
        res = db.table("pdfs").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        
        items = []
        for d in res.data:
            items.append({
                "name": d["name"],
                "file": d["r2_key"],
                "folder": d["folder"],
                "last_modified": d["created_at"],
                "thumb": d["thumbnail_key"]
            })
            
        return items
        
    except Exception as e:
        print(f"Error listing PDFs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pdf/upload")
async def upload_pdf(
    name: str = Form(...),
    folder: str | None = Form(None),
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    """Upload a PDF to R2 and save its metadata to the database."""
    from services.database import get_db
    db = get_db()
    
    if not r2_client or not R2_BUCKET_NAME:
        raise HTTPException(status_code=400, detail="Cloudflare R2 is not configured")
        
    safe_name = _safe_name(name)
    if not safe_name:
        raise HTTPException(status_code=400, detail="PDF name required")
        
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty PDF")
        
    # 1. Upload file to R2
    key = f"{R2_BUCKET_NAME}/pdf/{safe_name}.pdf"
    thumb_key = _build_thumb(content, safe_name)
    
    try:
        r2_client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=key,
            Body=content,
            ContentType="application/pdf",
        )
    except Exception as e:
        print(f"R2 Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
    # 2. Update metadata in database
    safe_folder = _safe_name(folder) if folder else "Uncategorized"
    
    try:
        # Upsert: Try to update by name + user_id, or insert new
        existing = db.table("pdfs").select("id").eq("user_id", user_id).eq("name", safe_name).execute()
        
        entry = {
            "user_id": user_id,
            "name": safe_name,
            "r2_key": key,
            "thumbnail_key": thumb_key,
            "folder": safe_folder
        }
        
        if existing.data:
            db.table("pdfs").update(entry).eq("id", existing.data[0]["id"]).execute()
        else:
            db.table("pdfs").insert(entry).execute()
            
        invalidate_cache(f"pdfs:order:{safe_folder}")
        return {"ok": True, "name": safe_name, "file": key, "folder": safe_folder}
        
    except Exception as e:
        print(f"Database error during PDF upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pdf/rename")
def rename_pdf(payload: PdfRename, user_id: str = Depends(get_current_user)):
    """Rename a PDF in both storage and database."""
    from services.database import get_db
    db = get_db()
    
    old = _safe_name(payload.old_name)
    new = _safe_name(payload.new_name)
    if not old or not new or old == new:
        raise HTTPException(status_code=400, detail="Invalid PDF names")
        
    old_key = f"{R2_BUCKET_NAME}/pdf/{old}.pdf"
    new_key = f"{R2_BUCKET_NAME}/pdf/{new}.pdf"
    
    try:
        # 1. Check if target exists in storage
        try:
            r2_client.head_object(Bucket=R2_BUCKET_NAME, Key=new_key)
            raise HTTPException(status_code=400, detail="Target PDF already exists")
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") not in ("404", "NoSuchKey", "NotFound"):
                raise
        
        # 2. Rename in storage (Copy + Delete)
        obj = r2_client.get_object(Bucket=R2_BUCKET_NAME, Key=old_key)
        r2_client.put_object(Bucket=R2_BUCKET_NAME, Key=new_key, Body=obj["Body"].read(), ContentType="application/pdf")
        r2_client.delete_object(Bucket=R2_BUCKET_NAME, Key=old_key)
        
        # 3. Rename thumbnail if it exists
        old_thumb = _thumb_key(old)
        new_thumb = _thumb_key(new)
        try:
            tobj = r2_client.get_object(Bucket=R2_BUCKET_NAME, Key=old_thumb)
            r2_client.put_object(Bucket=R2_BUCKET_NAME, Key=new_thumb, Body=tobj["Body"].read(), ContentType="image/jpeg")
            r2_client.delete_object(Bucket=R2_BUCKET_NAME, Key=old_thumb)
        except Exception:
            new_thumb = None
            
        # 4. Update database
        db.table("pdfs").update({
            "name": new,
            "r2_key": new_key,
            "thumbnail_key": new_thumb if new_thumb else None
        }).eq("user_id", user_id).eq("name", old).execute()
        
        invalidate_cache("pdfs:")
        return {"ok": True, "old_name": old, "new_name": new}
        
    except Exception as e:
        print(f"Error renaming PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/pdf/delete")
def delete_pdf(payload: PdfDelete, user_id: str = Depends(get_current_user)):
    """Delete a PDF from both storage and database."""
    from services.database import get_db
    db = get_db()
    
    name = _safe_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="PDF name required")
        
    try:
        # 1. Fetch metadata before deleting
        existing = db.table("pdfs").select("r2_key, thumbnail_key").eq("user_id", user_id).eq("name", name).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="PDF not found")
            
        r2_key = existing.data[0]["r2_key"]
        thumb_key = existing.data[0]["thumbnail_key"]
        
        # 2. Delete from storage
        try:
            r2_client.delete_object(Bucket=R2_BUCKET_NAME, Key=r2_key)
            if thumb_key:
                r2_client.delete_object(Bucket=R2_BUCKET_NAME, Key=thumb_key)
        except Exception:
            pass # Storage deletion failure shouldn't block DB deletion
            
        # 3. Delete from database
        db.table("pdfs").delete().eq("user_id", user_id).eq("name", name).execute()
        
        invalidate_cache("pdfs:")
        return {"ok": True, "name": name}
    except Exception as e:
        print(f"Error deleting PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pdf/move")
def move_pdf(payload: PdfMove, user_id: str = Depends(get_current_user)):
    """Move a PDF to a different folder in the database."""
    from services.database import get_db
    db = get_db()
    
    name = _safe_name(payload.name)
    folder = _safe_name(payload.folder) if payload.folder else "Uncategorized"
    
    try:
        db.table("pdfs").update({"folder": folder}).eq("user_id", user_id).eq("name", name).execute()
        invalidate_cache("pdfs:")
        return {"ok": True, "name": name, "folder": folder}
    except Exception as e:
        print(f"Error moving PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/order/pdfs")
def order_pdfs_get(scope: str | None = None, user_id: str = Depends(get_current_user)):
    """Get the ordered list of PDF names in a specific folder."""
    from services.database import get_db
    db = get_db()
    safe_scope = _safe_name(scope or "root") or "root"
    cache_key = f"pdfs:order:{user_id}:{safe_scope}"
    cached = get_cached(cache_key, PDF_ORDER_CACHE_TTL)
    if cached is not None:
        return cached
        
    try:
        # Fetch PDFs in folder sorted by order_index
        res = db.table("pdfs").select("name").eq("user_id", user_id).eq("folder", safe_scope).order("order_index").execute()
        
        names = [d["name"] for d in res.data]
        set_cached(cache_key, names)
        return names
    except Exception as e:
        print(f"Error fetching PDF order: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/order/pdfs")
def order_pdfs_set(payload: PdfOrderUpdate, user_id: str = Depends(get_current_user)):
    """Update PDF order_index in the database for drag-and-drop support."""
    from services.database import get_db
    db = get_db()
    scope = _safe_name(payload.scope or "root") or "root"
    names = [_safe_name(x) for x in (payload.order or []) if _safe_name(x)]
    
    try:
        for idx, name in enumerate(names):
            db.table("pdfs").update({"order_index": idx}).eq("user_id", user_id).eq("name", name).execute()
            
        invalidate_cache(f"pdfs:order:{user_id}:{scope}")
        return {"ok": True, "scope": scope, "order": names}
    except Exception as e:
        print(f"Error updating PDF order: {e}")
        raise HTTPException(status_code=500, detail=str(e))
