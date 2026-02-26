"""
Audio Tasks (Celery)
====================
Celery tasks for background audio generation. These replace all
`threading.Thread(target=generate_story_audio_background, ...)` calls
and `executor.submit(generate_audio_for_word, ...)` calls.

Every task writes its final status (`done` or `failed`) to the
`job_status` table in Supabase so the frontend can poll for completion.
"""

import io
import re
import logging

from celery import shared_task
from botocore.exceptions import ClientError

from services.storage import (
    r2_client,
    R2_BUCKET_NAME,
    story_audio_key,
    story_audio_prefix,
)
from services.tts import tts_service
from services.database import get_db
from utils import safe_tts_key

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_tts_key(text: str, lang: str = "de") -> str:
    return safe_tts_key(text, R2_BUCKET_NAME, lang)


def _update_job_status(reference_id: str, job_type: str, user_id: str, status: str, error: str | None = None):
    """Write / update a job_status row in Supabase. Fire-and-forget; never raises."""
    try:
        db = get_db()
        payload = {
            "user_id": user_id,
            "job_type": job_type,
            "reference_id": reference_id,
            "status": status,
        }
        if error:
            payload["error"] = error[:500]  # Truncate long tracebacks

        # Upsert by (user_id, job_type, reference_id)
        existing = (
            db.table("job_status")
            .select("id")
            .eq("user_id", user_id)
            .eq("job_type", job_type)
            .eq("reference_id", reference_id)
            .execute()
        )
        if existing.data:
            db.table("job_status").update(payload).eq("id", existing.data[0]["id"]).execute()
        else:
            db.table("job_status").insert(payload).execute()
    except Exception as exc:
        logger.warning("Could not update job_status: %s", exc)


# ---------------------------------------------------------------------------
# Task: Single-word TTS audio
# ---------------------------------------------------------------------------

@shared_task(
    name="tasks.audio.generate_word_audio",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    acks_late=True,
)
def generate_word_audio(self, word: str):
    """
    Generate TTS audio for a single German word and store it in R2.
    Skips silently if the file already exists (idempotent).
    """
    if not r2_client or not R2_BUCKET_NAME or not word:
        return

    try:
        r2_key = _safe_tts_key(word, "de")

        # Skip if already generated
        try:
            r2_client.head_object(Bucket=R2_BUCKET_NAME, Key=r2_key)
            return
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code not in ("404", "NoSuchKey", "NotFound"):
                raise

        audio_bytes = tts_service.generate(text=word, lang="de")
        r2_client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=r2_key,
            Body=audio_bytes,
            ContentType="audio/mpeg",
        )
    except Exception as exc:
        logger.warning("generate_word_audio failed for '%s': %s", word, exc)
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# Task: Story audio (all segments for a story)
# ---------------------------------------------------------------------------

@shared_task(
    name="tasks.audio.generate_story_audio",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def generate_story_audio(self, deck_id: str, segments: list, user_id: str):
    """
    Generate TTS audio for every German sentence in a story and upload to R2.
    Called after story generation in stories.py.
    Updates job_status table when complete.
    """
    _update_job_status(deck_id, "story_audio", user_id, "processing")

    if not r2_client or not R2_BUCKET_NAME:
        _update_job_status(deck_id, "story_audio", user_id, "failed", "R2 not configured")
        return

    try:
        # Clear previous audio
        _delete_story_audio(deck_id, user_id)

        texts = set()
        for seg in segments:
            text = (seg.get("text_de") or "").strip()
            if not text:
                continue
            for part in re.split(r"(?<=[.!?])\s+", text):
                sentence = part.strip()
                if sentence:
                    texts.add(sentence)

        for text in texts:
            try:
                key = story_audio_key(deck_id, text, user_id)
                # Skip if exists
                try:
                    r2_client.head_object(Bucket=R2_BUCKET_NAME, Key=key)
                    continue
                except ClientError:
                    pass

                audio_bytes = tts_service.generate(text=text, lang="de")
                r2_client.put_object(
                    Bucket=R2_BUCKET_NAME,
                    Key=key,
                    Body=audio_bytes,
                    ContentType="audio/mpeg",
                )
            except Exception as exc:
                logger.warning("Story audio segment failed: %s", exc)

        _update_job_status(deck_id, "story_audio", user_id, "done")

    except Exception as exc:
        error_msg = str(exc)
        logger.error("generate_story_audio task failed: %s", error_msg)
        _update_job_status(deck_id, "story_audio", user_id, "failed", error_msg)
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# Task: Deck audio (all words in a deck)
# ---------------------------------------------------------------------------

@shared_task(
    name="tasks.audio.generate_deck_audio",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def generate_deck_audio(self, deck_id: str, words: list, user_id: str):
    """
    Generate TTS audio for all German words in a deck in one Celery task.
    Updates job_status table when complete.
    """
    _update_job_status(deck_id, "deck_audio", user_id, "processing")
    try:
        for word in words:
            generate_word_audio.apply_async(args=[word])
        _update_job_status(deck_id, "deck_audio", user_id, "done")
    except Exception as exc:
        _update_job_status(deck_id, "deck_audio", user_id, "failed", str(exc))
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# Internal helper (not a task)
# ---------------------------------------------------------------------------

def _delete_story_audio(deck_id: str, user_id: str):
    """Delete all existing audio files for a story from R2."""
    if not r2_client or not R2_BUCKET_NAME:
        return
    prefix = story_audio_prefix(deck_id, user_id)
    try:
        continuation = None
        while True:
            kwargs = {"Bucket": R2_BUCKET_NAME, "Prefix": prefix}
            if continuation:
                kwargs["ContinuationToken"] = continuation
            resp = r2_client.list_objects_v2(**kwargs)
            for obj in resp.get("Contents", []):
                try:
                    r2_client.delete_object(Bucket=R2_BUCKET_NAME, Key=obj["Key"])
                except Exception:
                    pass
            if not resp.get("IsTruncated"):
                break
            continuation = resp.get("NextContinuationToken")
    except Exception:
        pass
