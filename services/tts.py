"""
TTS Service — Provider-Agnostic Text-to-Speech
===============================================
Controls which TTS backend is used via the `TTS_PROVIDER` env variable:

    TTS_PROVIDER=gtts     (default) — free, no API key needed, lower quality
    TTS_PROVIDER=google   — Google Cloud Neural2 voices, high quality

Usage (everywhere in the codebase):
    from services.tts import tts_service
    audio_bytes = tts_service.generate(text="Bahnhof", lang="de")

The service also checks the global_audio_cache table in Supabase before
generating — if the audio already exists (from any user), the R2 key is
returned directly without generating a new file.
"""

import io
import hashlib
import logging
import os

from services.storage import r2_client, R2_BUCKET_NAME

logger = logging.getLogger(__name__)

TTS_PROVIDER = os.getenv("TTS_PROVIDER", "gtts").lower()

# -----------------------------------------------------------------------
# Cache key helper
# -----------------------------------------------------------------------

def _cache_key(text: str, lang: str) -> str:
    """Deterministic cache key: SHA256 of lang:normalized_text."""
    normalized = text.strip().lower()
    raw = f"{lang}:{normalized}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# -----------------------------------------------------------------------
# Global audio cache helpers (Supabase)
# -----------------------------------------------------------------------

def _global_cache_lookup(cache_key: str) -> str | None:
    """Return R2 key if audio already cached globally, else None."""
    try:
        from services.database import get_db
        db = get_db()
        res = (
            db.table("global_audio_cache")
            .select("r2_key")
            .eq("cache_key", cache_key)
            .limit(1)
            .execute()
        )
        return res.data[0]["r2_key"] if res.data else None
    except Exception as exc:
        logger.debug("Global cache lookup failed: %s", exc)
        return None


def _global_cache_store(cache_key: str, r2_key: str, lang: str, text: str):
    """Write a newly generated audio file to the global cache. Fire-and-forget."""
    try:
        from services.database import get_db
        db = get_db()
        db.table("global_audio_cache").upsert(
            {"cache_key": cache_key, "r2_key": r2_key, "lang": lang, "text_input": text},
            on_conflict="cache_key",
        ).execute()
    except Exception as exc:
        logger.debug("Global cache store failed: %s", exc)


# -----------------------------------------------------------------------
# Backends
# -----------------------------------------------------------------------

class GTTSBackend:
    """Free gTTS backend — no API key required."""

    def generate(self, text: str, lang: str, slow: bool = False) -> bytes:
        from gtts import gTTS
        buf = io.BytesIO()
        gTTS(text=text, lang=lang, slow=slow).write_to_fp(buf)
        return buf.getvalue()


class GoogleCloudTTSBackend:
    """
    Google Cloud Text-to-Speech backend.
    Requires: GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON,
              or GOOGLE_TTS_API_KEY for API-key auth.
    Install: pip install google-cloud-texttospeech
    """

    # Neural2 voices per language (extend as needed)
    _VOICE_MAP = {
        "de": ("de-DE", "de-DE-Neural2-B"),
        "en": ("en-US", "en-US-Neural2-D"),
        "fr": ("fr-FR", "fr-FR-Neural2-B"),
        "es": ("es-ES", "es-ES-Neural2-B"),
    }

    def __init__(self):
        try:
            from google.cloud import texttospeech
            self._client = texttospeech.TextToSpeechClient()
            self._tts = texttospeech
            logger.info("Google Cloud TTS backend initialised.")
        except Exception as exc:
            raise RuntimeError(
                "google-cloud-texttospeech not installed or credentials not set. "
                "Run: pip install google-cloud-texttospeech"
            ) from exc

    def generate(self, text: str, lang: str, slow: bool = False) -> bytes:
        language_code, voice_name = self._VOICE_MAP.get(lang, ("de-DE", "de-DE-Neural2-B"))
        synthesis_input = self._tts.SynthesisInput(text=text)
        voice = self._tts.VoiceSelectionParams(
            language_code=language_code,
            name=voice_name,
        )
        audio_config = self._tts.AudioConfig(
            audio_encoding=self._tts.AudioEncoding.MP3,
            speaking_rate=0.85 if slow else 1.0,
        )
        response = self._client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config,
        )
        return response.audio_content


# -----------------------------------------------------------------------
# Main TTS service
# -----------------------------------------------------------------------

class TTSService:
    """
    Unified TTS service with global audio caching.

    Flow:
        1. Compute cache_key for (text, lang)
        2. Check global_audio_cache table → if hit, stream from R2
        3. If miss, generate audio bytes via the configured backend
        4. Upload to R2, store in global_audio_cache
        5. Return audio bytes
    """

    def __init__(self):
        provider = TTS_PROVIDER
        if provider == "google":
            try:
                self._backend = GoogleCloudTTSBackend()
                self._provider_name = "google"
            except Exception as exc:
                logger.warning("Google Cloud TTS init failed, falling back to gTTS: %s", exc)
                self._backend = GTTSBackend()
                self._provider_name = "gtts_fallback"
        else:
            self._backend = GTTSBackend()
            self._provider_name = "gtts"

    @property
    def provider(self) -> str:
        return self._provider_name

    def generate(self, text: str, lang: str = "de", slow: bool = False) -> bytes:
        """
        Generate TTS audio for the given text. Uses the global cache if possible.
        Returns raw MP3 bytes.
        """
        if not text or not text.strip():
            raise ValueError("TTS text cannot be empty")

        text = text.strip()
        ck = _cache_key(text, lang)

        # 1. Check global cache — get cached R2 key
        cached_r2_key = _global_cache_lookup(ck)
        if cached_r2_key and r2_client and R2_BUCKET_NAME:
            try:
                obj = r2_client.get_object(Bucket=R2_BUCKET_NAME, Key=cached_r2_key)
                logger.debug("Global audio cache HIT for '%s' (%s)", text[:30], lang)
                return obj["Body"].read()
            except Exception:
                pass  # Cache entry stale — regenerate below

        # 2. Generate audio
        audio_bytes = self._backend.generate(text=text, lang=lang, slow=slow)

        # 3. Upload to R2 and store in global cache
        if r2_client and R2_BUCKET_NAME:
            try:
                from utils import safe_tts_key
                r2_key = safe_tts_key(text, R2_BUCKET_NAME, lang)
                r2_client.put_object(
                    Bucket=R2_BUCKET_NAME,
                    Key=r2_key,
                    Body=audio_bytes,
                    ContentType="audio/mpeg",
                )
                _global_cache_store(ck, r2_key, lang, text)
            except Exception as exc:
                logger.warning("Failed to upload TTS to R2: %s", exc)

        return audio_bytes

    def r2_key_for(self, text: str, lang: str = "de") -> str | None:
        """
        Return the cached R2 key for this text if it exists, without generating.
        Useful for checking if audio is already available before streaming.
        """
        ck = _cache_key(text, lang)
        return _global_cache_lookup(ck)


# Singleton — import this everywhere
tts_service = TTSService()
