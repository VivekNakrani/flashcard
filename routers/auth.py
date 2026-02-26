from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from services.database import get_db

router = APIRouter(prefix="/auth")


class AuthPayload(BaseModel):
    email: str
    password: str


@router.get("/login")
def login_page():
    """Serve the login HTML page."""
    return FileResponse("templates/login.html")


@router.post("/login")
def login(payload: AuthPayload):
    """
    Authenticate user with Supabase.
    Returns an access token on success.
    """
    try:
        db = get_db()
        response = db.auth.sign_in_with_password({
            "email": payload.email,
            "password": payload.password
        })

        if not response.session:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        return {
            "access_token": response.session.access_token,
            "email": response.user.email,
            "user_id": str(response.user.id)
        }

    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        # Give a friendly message for wrong credentials
        if "Invalid login credentials" in error_msg or "invalid_credentials" in error_msg:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        raise HTTPException(status_code=500, detail=f"Auth error: {error_msg}")


@router.post("/signup")
def signup(payload: AuthPayload):
    """
    Register a new user with Supabase Auth.
    Supabase will send a confirmation email.
    """
    try:
        db = get_db()
        response = db.auth.sign_up({
            "email": payload.email,
            "password": payload.password
        })

        if not response.user:
            raise HTTPException(status_code=400, detail="Signup failed. Try a different email.")

        return {
            "ok": True,
            "message": "Account created. Please confirm your email before logging in.",
            "email": response.user.email
        }

    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        if "already registered" in error_msg or "User already registered" in error_msg:
            raise HTTPException(status_code=400, detail="This email is already registered.")
        raise HTTPException(status_code=500, detail=f"Signup error: {error_msg}")


@router.post("/logout")
def logout():
    """
    Client-side logout just clears localStorage.
    This endpoint is a server-side signal (optional to call).
    """
    return {"ok": True, "message": "Logged out. Clear your token on the client."}
