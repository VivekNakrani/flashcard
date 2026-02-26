import os
from services.database import get_db
from dotenv import load_dotenv

load_dotenv()

def fix_pdf_ownership():
    db = get_db()
    try:
        target_user_id = "07604871-5419-4864-9552-a5b7438d787d"
        print(f"Target User ID for reassignment: {target_user_id}")
        
        # 2. Update all PDFs to this user
        res = db.table("pdfs").update({"user_id": target_user_id}).neq("user_id", target_user_id).execute()
        print(f"Reassigned {len(res.data) if res.data else 0} PDFs to {target_user_id}")
        
        # 3. Update all PDF folders to this user
        fres = db.table("pdf_folders").update({"user_id": target_user_id}).neq("user_id", target_user_id).execute()
        print(f"Reassigned {len(fres.data) if fres.data else 0} folders to {target_user_id}")
        
    except Exception as e:
        print(f"Error reassigning PDFs: {e}")

if __name__ == "__main__":
    fix_pdf_ownership()
