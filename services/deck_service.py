from fastapi import HTTPException
from services.database import get_db
from utils import safe_deck_name


def get_cards(deck: str, user_id: str | None = None) -> list[dict]:
    """
    Fetch cards from the 'cards' table in Supabase.
    
    Args:
        deck: The deck name
        user_id: The ID of the authenticated user
        
    Returns:
        List of card dictionaries with 'en' and 'de' keys
        
    Raises:
        HTTPException: If deck name is invalid, not found, or DB error occurs
    """
    safe = safe_deck_name(deck)
    if not safe:
        raise HTTPException(status_code=400, detail="Invalid deck name")

    db = get_db()
    
    try:
        # 1. Find the deck ID for this user (or template deck if user_id is None)
        query = db.table("decks").select("id").eq("name", safe)
        if user_id:
            query = query.eq("user_id", user_id)
        else:
            query = query.is_("user_id", "null")
            
        deck_res = query.execute()
        
        # If not found for user, try looking for a template deck (user_id is NULL) as fallback
        if not deck_res.data and user_id:
            deck_res = db.table("decks").select("id").eq("name", safe).is_("user_id", "null").execute()
            
        if not deck_res.data:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        deck_id = deck_res.data[0]["id"]
        
        # 2. Fetch all cards for this deck_id, sorted by order_index
        cards_res = db.table("cards").select("en, de").eq("deck_id", deck_id).order("order_index").execute()
        
        if not cards_res.data:
            return []
            
        return [{"en": c["en"], "de": c["de"]} for c in cards_res.data]
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching cards from DB: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_cards_silent(deck: str, user_id: str | None = None) -> list[dict]:
    """
    Fetch cards from DB, returning empty list on errors.
    """
    try:
        return get_cards(deck, user_id)
    except Exception:
        return []
