"""
Celery Application Configuration
=================================
This module initialises the Celery app and configures it to use Redis
as both the message broker and the result backend.

Environment variables (add to .env):
    REDIS_URL=redis://localhost:6379/0   (local dev)
    REDIS_URL=rediss://:<password>@...   (Upstash / managed Redis)

Starting the worker:
    celery -A services.celery_app worker --loglevel=info --concurrency=4
"""

import os
import logging
import sentry_sdk
from sentry_sdk.integrations.celery import CeleryIntegration
from logtail import LogtailHandler
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

# Initialize Sentry
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[CeleryIntegration()],
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )

# Initialize Centralized Logging (BetterStack)
LOGTAIL_SOURCE_TOKEN = os.getenv("LOGTAIL_SOURCE_TOKEN")
if LOGTAIL_SOURCE_TOKEN:
    logger = logging.getLogger(__name__)
    handler = LogtailHandler(source_token=LOGTAIL_SOURCE_TOKEN)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
else:
    logging.basicConfig(level=logging.INFO)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "flashcard_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "tasks.audio",
        "tasks.pdf",
    ],
)

celery_app.conf.update(
    # Serialisation
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Reliability
    task_acks_late=True,           # Re-queue if worker crashes mid-task
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,  # Fair dispatch — don't over-fetch tasks

    # Timeouts and retries
    task_soft_time_limit=120,      # Soft: task gets SoftTimeLimitExceeded
    task_time_limit=180,           # Hard: worker killed after 3 min

    # Result expiry
    result_expires=3600,           # Clear results from Redis after 1 hour

    # Timezone
    timezone="UTC",
    enable_utc=True,
)
