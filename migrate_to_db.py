"""
migrate_to_db.py - Migrates flashcard content and PDF metadata from R2 to Supabase.
"""
import os
import csv
import io
import json
from datetime import datetime
from dotenv import load_dotenv
import boto3
from botocore.config import Config
from supabase import create_client

load_dotenv()

# R2 Config
R2_ACCESS_KEY_ID = os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID") or os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY") or os.getenv("R2_SECRET_ACCESS_KEY")
R2_ACCOUNT_ID = os.getenv("CLOUDFLARE_R2_ACCOUNT_ID") or os.getenv("R2_ACCOUNT_ID")
R2_BUCKET_NAME = os.getenv("CLOUDFLARE_R2_BUCKET") or os.getenv("R2_BUCKET")
R2_ENDPOINT = os.getenv("CLOUDFLARE_R2_ENDPOINT") or (f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else None)

# Supabase Config
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Clients
db = create_client(SUPABASE_URL, SUPABASE_KEY)

BACKUP_DIR = "r2_backup"

def migrate_cards():
    print("--- 🔤 MIGRATING CARDS ---")
    # 1. Get all decks from DB
    decks = db.table("decks").select("id, name, r2_key, user_id").execute()
    
    total_cards = 0
    for deck in decks.data:
        deck_id = deck["id"]
        deck_name = deck["name"]
        user_id = deck["user_id"]
        r2_key = deck["r2_key"]
        
        # Strip bucket name if present
        if r2_key.startswith(f"{R2_BUCKET_NAME}/"):
            r2_key = r2_key[len(R2_BUCKET_NAME)+1:]
            
        # Try to find the file in the local backup
        local_path = os.path.join(BACKUP_DIR, r2_key)
        
        if not os.path.exists(local_path):
            print(f"  ⚠️ Skipping {deck_name}: local file {local_path} not found")
            continue

        print(f"  Reading local deck: {deck_name} ({local_path})")
        
        try:
            with open(local_path, mode='r', encoding='utf-8', errors='ignore') as f:
                reader = csv.reader(f)
                cards_to_insert = []
                for idx, row in enumerate(reader):
                    if len(row) >= 2:
                        en, de = row[0].strip(), row[1].strip()
                        if en and de:
                            cards_to_insert.append({
                                "deck_id": deck_id,
                                "user_id": user_id,
                                "en": en,
                                "de": de,
                                "order_index": idx
                            })
                
                if cards_to_insert:
                    # Clean existing cards for this deck to avoid duplicates if re-running
                    db.table("cards").delete().eq("deck_id", deck_id).execute()
                    
                    # Insert in batches
                    for i in range(0, len(cards_to_insert), 100):
                        batch = cards_to_insert[i:i+100]
                        db.table("cards").insert(batch).execute()
                    total_cards += len(cards_to_insert)
                    print(f"    ✅ Inserted {len(cards_to_insert)} cards")
                
        except Exception as e:
            print(f"    ❌ Error processing {local_path}: {e}")

    print(f"--- Finished Cards Migration: {total_cards} cards total ---\n")

def migrate_pdfs():
    print("--- 📄 MIGRATING PDFS ---")
    index_path = os.path.join(BACKUP_DIR, "pdf", "index.json")
    
    if not os.path.exists(index_path):
        print(f"  ❌ PDF index not found at {index_path}")
        return

    try:
        # Get a sample user_id to assign these to (since the old index didn't have them)
        user_res = db.table("decks").select("user_id").limit(1).execute()
        user_id = user_res.data[0]["user_id"] if user_res.data else None

        with open(index_path, 'r', encoding='utf-8') as f:
            all_pdfs = json.loads(f.read())
        
        if not all_pdfs:
            print("  No PDFs found in index.")
            return

        print(f"  Found {len(all_pdfs)} PDFs in index.")
        
        # Clear existing pdfs
        db.table("pdfs").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        
        pdf_rows = []
        for p in all_pdfs:
            pdf_rows.append({
                "user_id": user_id,
                "name": p.get("name"),
                "r2_key": p.get("file"),
                "thumbnail_key": p.get("thumb"),
                "folder": p.get("folder") or "Uncategorized",
                "order_index": 0
            })
            
        if pdf_rows:
            db.table("pdfs").insert(pdf_rows).execute()
            print(f"  ✅ Migrated {len(pdf_rows)} PDFs to database.")
            
    except Exception as e:
        print(f"  ❌ Error migrating PDFs: {e}")

def migrate_pdf_folders():
    print("--- 📁 MIGRATING PDF FOLDERS ---")
    folder_path = os.path.join(BACKUP_DIR, "pdf", "folders", "index.json")
    
    if not os.path.exists(folder_path):
        print(f"  ❌ PDF folders index not found at {folder_path}")
        return

    try:
        user_res = db.table("decks").select("user_id").limit(1).execute()
        user_id = user_res.data[0]["user_id"] if user_res.data else None

        with open(folder_path, 'r', encoding='utf-8') as f:
            folders = json.loads(f.read())
        
        if not folders:
            print("  No PDF folders found in index.")
            return

        print(f"  Found {len(folders)} PDF folders.")
        
        # Clear existing
        db.table("pdf_folders").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        
        rows = []
        for idx, name in enumerate(folders):
            rows.append({
                "user_id": user_id,
                "name": name,
                "order_index": idx
            })
            
        if rows:
            db.table("pdf_folders").insert(rows).execute()
            print(f"  ✅ Migrated {len(rows)} PDF folders to database.")
            
    except Exception as e:
        print(f"  ❌ Error migrating PDF folders: {e}")

if __name__ == "__main__":
    # migrate_cards() # Already done effectively
    migrate_pdfs()
    migrate_pdf_folders()
