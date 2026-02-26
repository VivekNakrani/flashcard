import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY")

# Create the Supabase client
supabase: Client = None

if url and key:
    try:
        supabase = create_client(url, key)
    except Exception as e:
        print(f"Error initializing Supabase client: {e}")
        supabase = None

def get_db():
    """Helper to get the database client."""
    if not supabase:
        raise Exception("Supabase is not configured. Check your .env file.")
    return supabase
