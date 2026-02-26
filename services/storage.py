import os
import re
import logging
import threading
import boto3
from botocore.config import Config
from dotenv import load_dotenv
from utils import safe_deck_name

# Logger for storage operations
logger = logging.getLogger(__name__)

# Load env
load_dotenv()

# Fallback names to ensure .env works regardless of prefix
R2_ACCESS_KEY_ID = os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID") or os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY") or os.getenv("R2_SECRET_ACCESS_KEY")
R2_ACCOUNT_ID = os.getenv("CLOUDFLARE_R2_ACCOUNT_ID") or os.getenv("R2_ACCOUNT_ID")
R2_BUCKET_NAME = os.getenv("CLOUDFLARE_R2_BUCKET") or os.getenv("R2_BUCKET")

R2_ENDPOINT = (
    os.getenv("CLOUDFLARE_R2_ENDPOINT")
    or os.getenv("R2_ENDPOINT_URL")
    or (f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else None)
)
R2_PUBLIC_URL_BASE = os.getenv("R2_PUBLIC_URL_BASE")

print(f"--- R2 CONFIG CHECK ---")
print(f"Bucket: {R2_BUCKET_NAME}")
print(f"Endpoint: {R2_ENDPOINT}")
print(f"Access Key Fixed: {'Yes' if R2_ACCESS_KEY_ID else 'No'}")
print(f"-----------------------")

r2_client = None
if R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_ENDPOINT:
    try:
        r2_client = boto3.client(
            "s3",
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            endpoint_url=R2_ENDPOINT,
            region_name="auto",
            config=Config(s3={"addressing_style": "path"}),
        )
    except Exception as e:
        print(f"R2 Client Error: {e}")
        r2_client = None


def lines_key(deck: str) -> str:
    safe = safe_deck_name(deck)
    return f"{R2_BUCKET_NAME}/lines/{safe}.json"

def story_key(deck: str, user_id: str | None = None) -> str:
    safe = safe_deck_name(deck)
    if user_id:
        return f"{R2_BUCKET_NAME}/stories/users/{user_id}/{safe}/story.json"
    return f"{R2_BUCKET_NAME}/stories/{safe}/story.json"

def story_audio_key(deck: str, text: str, user_id: str | None = None) -> str:
    """Generate R2 key for story-specific audio file."""
    safe_deck = safe_deck_name(deck)
    safe_text = re.sub(r"[^A-Za-z0-9_\-]", "_", text).strip("_")
    if not safe_text:
        safe_text = "audio"
    if user_id:
        return f"{R2_BUCKET_NAME}/stories/users/{user_id}/{safe_deck}/audio/{safe_text}.mp3"
    return f"{R2_BUCKET_NAME}/stories/{safe_deck}/audio/{safe_text}.mp3"

def story_audio_prefix(deck: str, user_id: str | None = None) -> str:
    """Get the prefix for all audio files of a story."""
    safe_deck = safe_deck_name(deck)
    if user_id:
        return f"{R2_BUCKET_NAME}/stories/users/{user_id}/{safe_deck}/audio/"
    return f"{R2_BUCKET_NAME}/stories/{safe_deck}/audio/"


# -----------------
# SCOPED KEY HELPERS (user-isolated, ID-based)
# -----------------

def pdf_file_key(pdf_id: str, user_id: str) -> str:
    """R2 key for a PDF file, scoped to a specific user and database record ID."""
    return f"{R2_BUCKET_NAME}/users/{user_id}/pdfs/{pdf_id}/file.pdf"


def pdf_thumbnail_key(pdf_id: str, user_id: str) -> str:
    """R2 key for a PDF thumbnail, scoped to a specific user and database record ID."""
    return f"{R2_BUCKET_NAME}/users/{user_id}/pdfs/{pdf_id}/thumb.jpg"


def deck_csv_key(deck_id: str, user_id: str) -> str:
    """R2 key for a deck CSV, scoped to a specific user and database record ID."""
    return f"{R2_BUCKET_NAME}/users/{user_id}/decks/{deck_id}/deck.csv"

# -----------------
# INDEX HELPERS (Supabase-backed)
# -----------------
import json
from services.database import get_db

def get_stories_index(user_id: str):
    """Fetch stories index for a specific user from Supabase."""
    db = get_db()
    try:
        res = db.table("stories").select("*").eq("user_id", user_id).order("last_modified", desc=True).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Failed to fetch stories index from DB: {e}")
        return []

def update_stories_index(meta: dict):
    """Upsert story metadata into Supabase."""
    db = get_db()
    user_id = meta.get("user_id")
    deck_name = meta.get("deck")
    
    if not user_id or not deck_name:
        logger.warning("Attempted to update stories index without user_id or deck_name")
        return

    try:
        entry = {
            "user_id": user_id,
            "deck_name": deck_name,
            "title_de": meta.get("title_de"),
            "title_en": meta.get("title_en"),
            "level": meta.get("level"),
            "r2_key": meta.get("key"),
            "last_modified": meta.get("last_modified") or "now()"
        }
        
        # Check if exists to decide insert/update
        existing = db.table("stories").select("id").eq("user_id", user_id).eq("deck_name", deck_name).execute()
        
        if existing.data:
            db.table("stories").update(entry).eq("id", existing.data[0]["id"]).execute()
        else:
            db.table("stories").insert(entry).execute()
            
    except Exception as e:
        logger.error(f"Failed to update stories in DB: {e}")

def remove_from_stories_index(deck: str, user_id: str):
    """Remove a story from Supabase."""
    db = get_db()
    try:
        db.table("stories").delete().eq("user_id", user_id).eq("deck_name", deck).execute()
    except Exception as e:
        logger.error(f"Failed to remove story from DB: {e}")
