import os
import boto3
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv()

R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")

R2_ENDPOINT = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

print(f"Testing connection to bucket: {R2_BUCKET_NAME}")
print(f"Endpoint: {R2_ENDPOINT}")

try:
    s3 = boto3.client(
        "s3",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        endpoint_url=R2_ENDPOINT,
        region_name="auto",
        config=Config(s3={"addressing_style": "path"}),
    )
    
    response = s3.list_objects_v2(Bucket=R2_BUCKET_NAME, MaxKeys=1)
    print("✅ Successfully connected to Cloudflare R2!")
    if 'Contents' in response:
        print(f"Found items in bucket.")
    else:
        print("Bucket is empty, but connection works.")
        
except Exception as e:
    print(f"❌ Connection failed: {e}")
