"""
Jobs Router
===========
Provides endpoints that the frontend can poll to check the status of
long-running background tasks (audio generation, PDF thumbnail creation).

Endpoints:
    GET /jobs/{reference_id}          — Latest job for a given item
    GET /jobs/list?job_type=...       — All jobs for the authenticated user
"""

from fastapi import APIRouter, Depends, HTTPException
from services.database import get_db
from services.auth import get_current_user

router = APIRouter()


@router.get("/jobs/{reference_id}")
def get_job_status(reference_id: str, job_type: str | None = None, user_id: str = Depends(get_current_user)):
    """
    Retrieve the status of a background job for an item.

    Args:
        reference_id: The deck name, story id, or PDF id the job references.
        job_type: Optional filter (e.g. 'deck_audio', 'story_audio', 'pdf_thumb').

    Returns:
        { status: 'pending' | 'processing' | 'done' | 'failed', job_type, created_at, updated_at }
    """
    try:
        db = get_db()
        query = (
            db.table("job_status")
            .select("id, job_type, status, error, created_at, updated_at")
            .eq("user_id", user_id)
            .eq("reference_id", reference_id)
            .order("updated_at", desc=True)
            .limit(1)
        )
        if job_type:
            query = query.eq("job_type", job_type)

        res = query.execute()

        if not res.data:
            # No record yet — treat as pending (task not started or already done with no record)
            return {
                "reference_id": reference_id,
                "status": "pending",
                "job_type": job_type,
                "created_at": None,
                "updated_at": None,
            }

        row = res.data[0]
        return {
            "reference_id": reference_id,
            "status": row["status"],
            "job_type": row["job_type"],
            "error": row.get("error"),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs")
def list_jobs(job_type: str | None = None, user_id: str = Depends(get_current_user)):
    """
    List all background jobs for the authenticated user.
    Optionally filter by job_type.
    """
    try:
        db = get_db()
        query = (
            db.table("job_status")
            .select("id, job_type, reference_id, status, error, created_at, updated_at")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(100)
        )
        if job_type:
            query = query.eq("job_type", job_type)

        res = query.execute()
        return {"jobs": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
