"""
backup_r2.py  –  Download all objects from your Cloudflare R2 bucket to a local folder.

Usage:
    python backup_r2.py                  # downloads everything
    python backup_r2.py csv/             # downloads only objects whose key starts with csv/
    python backup_r2.py csv/ tts/        # downloads csv/ and tts/ prefixes

Files are saved to:  ./r2_backup/<key>
"""

import os
import sys
import pathlib
from dotenv import load_dotenv
import boto3
from botocore.config import Config

load_dotenv()

R2_ACCESS_KEY_ID     = os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID") or os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY") or os.getenv("R2_SECRET_ACCESS_KEY")
R2_ACCOUNT_ID        = os.getenv("CLOUDFLARE_R2_ACCOUNT_ID") or os.getenv("R2_ACCOUNT_ID")
R2_BUCKET_NAME       = os.getenv("CLOUDFLARE_R2_BUCKET") or os.getenv("R2_BUCKET")
R2_ENDPOINT = (
    os.getenv("CLOUDFLARE_R2_ENDPOINT")
    or os.getenv("R2_ENDPOINT_URL")
    or (f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else None)
)

if not all([R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME]):
    print("❌  R2 credentials not found. Make sure your .env is configured.")
    sys.exit(1)

client = boto3.client(
    "s3",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    endpoint_url=R2_ENDPOINT,
    region_name="auto",
    config=Config(s3={"addressing_style": "path"}),
)

# Prefixes to download — default is the full bucket name prefix (i.e. everything)
# R2 keys in this app are stored as  <bucket_name>/<path>  so the root prefix is the bucket name.
prefixes = sys.argv[1:] if len(sys.argv) > 1 else [R2_BUCKET_NAME + "/"]

OUTPUT_DIR = pathlib.Path("r2_backup")
OUTPUT_DIR.mkdir(exist_ok=True)

print(f"📦  Bucket: {R2_BUCKET_NAME}")
print(f"📂  Saving to: {OUTPUT_DIR.resolve()}")
print(f"🔍  Prefixes: {prefixes}\n")

total_downloaded = 0
total_skipped    = 0
total_errors     = 0

for prefix in prefixes:
    print(f"── Scanning prefix: {prefix!r}")
    paginator = client.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=R2_BUCKET_NAME, Prefix=prefix)

    for page in pages:
        for obj in page.get("Contents", []):
            key  = obj["Key"]
            size = obj["Size"]

            # Build local path — strip the bucket-name prefix so paths look clean
            rel = key
            if rel.startswith(R2_BUCKET_NAME + "/"):
                rel = rel[len(R2_BUCKET_NAME) + 1:]

            local_path = OUTPUT_DIR / rel

            # Skip if already downloaded and same size
            if local_path.exists() and local_path.stat().st_size == size:
                total_skipped += 1
                continue

            local_path.parent.mkdir(parents=True, exist_ok=True)

            try:
                client.download_file(R2_BUCKET_NAME, key, str(local_path))
                print(f"  ✅  {rel}  ({size:,} bytes)")
                total_downloaded += 1
            except Exception as e:
                print(f"  ❌  {rel}  — {e}")
                total_errors += 1

print(f"\n🎉  Done!")
print(f"   Downloaded : {total_downloaded}")
print(f"   Skipped    : {total_skipped}  (already up-to-date)")
print(f"   Errors     : {total_errors}")
