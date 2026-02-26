# Tasks package for Celery background workers.
# Each module groups related tasks:
#
#   tasks.audio  — TTS audio generation (word-level and story-level)
#   tasks.pdf    — PDF thumbnail generation
#
# Import the celery_app so Celery can discover all tasks automatically.
from services.celery_app import celery_app  # noqa: F401
