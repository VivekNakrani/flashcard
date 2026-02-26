import os
from services.database import get_db
from dotenv import load_dotenv

load_dotenv()

def check_pdfs():
    db = get_db()
    try:
        # Check all PDFs
        res = db.table("pdfs").select("*").execute()
        print(f"Total PDFs in table: {len(res.data)}")
        
        users = set()
        for p in res.data:
            users.add(p.get("user_id"))
            
        print(f"User IDs found in table: {users}")
        
        if res.data:
            print("Sample PDF record:")
            print(res.data[0])
            
        # Check folders
        fres = db.table("pdf_folders").select("*").execute()
        print(f"Total folders: {len(fres.data)}")
        
    except Exception as e:
        print(f"Error checking PDFs: {e}")

if __name__ == "__main__":
    check_pdfs()
