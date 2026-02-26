"""
FOLDER MIGRATION SCRIPT
========================
Reads your existing folder structure from Cloudflare R2
and imports it into the Supabase 'folders' table.

Run this ONCE after creating the folders table in Supabase.
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

print("Starting folder migration from Cloudflare R2 → Supabase...\n")

# --- Step 1: Read folders/index.json from Cloudflare ---
folder_index_key = f"{R2_BUCKET_NAME}/folders/index.json"
folders = []
try:
    obj = r2.get_object(Bucket=R2_BUCKET_NAME, Key=folder_index_key)
    raw = obj["Body"].read().decode("utf-8")
    data = json.loads(raw)
    # The folder index can be a list or a dict
    if isinstance(data, list):
        folders = data
    elif isinstance(data, dict):
        folders = list(data.values())
    print(f"✅ Found {len(folders)} folders in Cloudflare folders/index.json\n")
except ClientError as e:
    code = e.response.get("Error", {}).get("Code")
    if code in ("404", "NoSuchKey", "NotFound"):
        print("⚠️  No folders/index.json found in Cloudflare.")
        print("   Will try to reconstruct folders from deck data instead...\n")
    else:
        print(f"❌ Failed to read folders from Cloudflare: {e}")
        exit(1)

# --- Step 2: If no folder index, reconstruct from existing deck data in Supabase ---
if not folders:
    print("Reconstructing folder list from decks already in Supabase...")
    deck_response = db.table("decks").select("folder_id").execute()
    seen = set()
    for deck in deck_response.data:
        fid = deck.get("folder_id")
        if fid and fid not in seen and fid != "root":
            seen.add(fid)
            folders.append({"name": fid})
    print(f"✅ Found {len(folders)} unique folders from deck data\n")

# --- Step 3: Insert each folder into Supabase ---
success = 0
skipped = 0
errors = 0

for folder in folders:
    if not isinstance(folder, dict):
        # Sometimes it's just a string name
        name = str(folder)
        parent_id = None
    else:
        name = folder.get("name") or folder.get("id")
        parent_id = folder.get("parent") or folder.get("parent_id")

    if not name or name == "root":
        skipped += 1
        continue

    # Check if folder already exists
    existing = db.table("folders").select("id").eq("name", name).execute()
    if existing.data:
        print(f"  ⏭️  Skipping '{name}' (already in Supabase)")
        skipped += 1
        continue

    try:
        row = {"name": name}
        if parent_id:
            row["parent_id"] = parent_id
        db.table("folders").insert(row).execute()
        print(f"  ✅ Imported folder: '{name}' (parent: {parent_id or 'root'})")
        success += 1
    except Exception as e:
        print(f"  ❌ Failed to import folder '{name}': {e}")
        errors += 1

print(f"\n--- FOLDER MIGRATION COMPLETE ---")
print(f"✅ Imported: {success}")
print(f"⏭️  Skipped:  {skipped}")
print(f"❌ Errors:   {errors}")
print(f"\nCheck Supabase → Table Editor → folders to see your data!")
