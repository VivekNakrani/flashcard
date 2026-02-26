"""
AUTH DEPENDENCIES
=================
This module provides FastAPI "dependencies" for protected routes.

Usage in any route:
    from services.auth import get_current_user

    @router.get("/decks")
    def list_decks(user_id: str = Depends(get_current_user)):
        # user_id is now guaranteed to be valid
        ...
"""

import os
from fastapi import Header, HTTPException, Depends
from services.database import get_db


def get_current_user(authorization: str = Header(None)) -> str:
    """
    Extracts and verifies the JWT token from the Authorization header.
    
    The browser sends:  Authorization: Bearer <token>
    We decode it with Supabase to get the user's ID.
    
    Returns: user_id (string UUID)
    Raises:  401 HTTPException if token is missing or invalid
    """
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Please log in.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Token format: "Bearer <actual_token>"
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid token format")

    token = parts[1]

    try:
        db = get_db()
        # Ask Supabase: "Who does this token belong to?"
        user_response = db.auth.get_user(token)

        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Token is invalid or expired")

        return str(user_response.user.id)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Could not validate token: {e}")


def get_current_user_optional(authorization: str = Header(None)) -> str | None:
    """
    Same as get_current_user but doesn't raise an error if no token.
    Returns None if not authenticated.
    Used for routes that work for both guests and logged-in users.
    """
    if not authorization:
        return None
    try:
        return get_current_user(authorization)
    except HTTPException:
        return None
