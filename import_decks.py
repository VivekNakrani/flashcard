"""
ONE-TIME MIGRATION SCRIPT
=========================
This script reads your existing deck list from Cloudflare R2 (the old system)
and imports each deck's metadata into Supabase (the new database).

Run this ONCE after setting up Supabase. You don't need to run it again.
"""

import os
import json
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# --- Connect to Cloudflare R2 ---
R2_ACCESS_KEY_ID = os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID") or os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY") or os.getenv("R2_SECRET_ACCESS_KEY")
R2_ACCOUNT_ID = os.getenv("CLOUDFLARE_R2_ACCOUNT_ID") or os.getenv("R2_ACCOUNT_ID")
R2_BUCKET_NAME = os.getenv("CLOUDFLARE_R2_BUCKET") or os.getenv("R2_BUCKET")
R2_ENDPOINT = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

r2 = boto3.client(
    "s3",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    endpoint_url=R2_ENDPOINT,
    region_name="auto",
    config=Config(s3={"addressing_style": "path"}),
)

# --- Connect to Supabase ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
db = create_client(SUPABASE_URL, SUPABASE_KEY)

print("Starting migration from Cloudflare R2 → Supabase...\n")

# --- Step 1: Read the old index.json from Cloudflare ---
index_key = f"{R2_BUCKET_NAME}/csv/index.json"
try:
    obj = r2.get_object(Bucket=R2_BUCKET_NAME, Key=index_key)
    raw = obj["Body"].read().decode("utf-8")
    decks = json.loads(raw)
    print(f"✅ Found {len(decks)} decks in Cloudflare index.json\n")
except ClientError as e:
    print(f"❌ Failed to read index.json from Cloudflare: {e}")
    exit(1)

# --- Step 2: Insert each deck into Supabase ---
success = 0
skipped = 0
errors = 0

for deck in decks:
    if not isinstance(deck, dict):
        continue
    
    name = deck.get("name")
    r2_key = deck.get("file")
    folder_id = deck.get("folder")
    
    if not name or not r2_key:
        print(f"  ⚠️  Skipping invalid entry: {deck}")
        skipped += 1
        continue
    
    # Check if deck already exists in Supabase
    existing = db.table("decks").select("id").eq("name", name).execute()
    if existing.data:
        print(f"  ⏭️  Skipping '{name}' (already in Supabase)")
        skipped += 1
        continue
    
    # Insert into Supabase (user_id is optional until we add auth)
    try:
        row = {"name": name, "r2_key": r2_key}
        if folder_id:
            row["folder_id"] = folder_id
        db.table("decks").insert(row).execute()
        print(f"  ✅ Imported: '{name}' (folder: {folder_id or 'root'})")
        success += 1
    except Exception as e:
        print(f"  ❌ Failed to import '{name}': {e}")
        errors += 1

print(f"\n--- MIGRATION COMPLETE ---")
print(f"✅ Imported: {success}")
print(f"⏭️  Skipped:  {skipped}")
print(f"❌ Errors:   {errors}")
print(f"\nYou can now go to Supabase → Table Editor → decks to see your data!")
