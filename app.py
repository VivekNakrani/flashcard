import os
import uvicorn
import logging
import sentry_sdk
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from sentry_sdk.integrations.fastapi import FastApiIntegration
from logtail import LogtailHandler
from dotenv import load_dotenv

# Load env immediately
load_dotenv(override=True)

# Initialize Sentry
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FastApiIntegration()],
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )

# Initialize Centralized Logging (BetterStack)
LOGTAIL_SOURCE_TOKEN = os.getenv("LOGTAIL_SOURCE_TOKEN")
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

if LOGTAIL_SOURCE_TOKEN:
    handler = LogtailHandler(source_token=LOGTAIL_SOURCE_TOKEN)
    logger.addHandler(handler)
else:
    # Fallback to standard console logging
    logging.basicConfig(level=logging.INFO)

from services.storage import r2_client, R2_BUCKET_NAME
from services.executor import shutdown_executor
from routers import screens, decks, folders, stories, cards, system, pdfs, auth, jobs

# Configuration
DEBUG_MODE = os.getenv("DEBUG_MODE", "false").lower() in ("true", "1", "yes")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

# ---------------------------------------------------------------------------
# AUTH SCRIPT MIDDLEWARE
# Automatically injects <script src="/static/js/auth.js"> into every HTML
# page served by the app. This means:
#   - No HTML template needs to carry the <script> tag manually.
#   - Adding new pages in the future requires zero extra work.
#   - The injection happens server-side; it cannot be "forgotten" for a page.
# ---------------------------------------------------------------------------
SENTRY_DSN_JS = os.getenv("SENTRY_DSN_JS")
SENTRY_INIT_JS = f"""
    <script src="https://browser.sentry-cdn.com/7.114.0/bundle.min.js" integrity="sha384-vK6U7+34K/tE1x2f+9..." crossorigin="anonymous"></script>
    <script>
        Sentry.init({{
            dsn: "{SENTRY_DSN_JS or ''}",
            tracesSampleRate: 1.0,
            replaysSessionSampleRate: 0.1,
            replaysOnErrorSampleRate: 1.0,
        }});
    </script>
""" if SENTRY_DSN_JS else ""

AUTH_SCRIPT_TAG = f'{SENTRY_INIT_JS}\n    <script src="/static/js/auth.js"></script>'.encode()

class AuthScriptMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        content_type = response.headers.get("content-type", "")
        if "text/html" not in content_type:
            # Not an HTML response — pass through untouched
            return response

        # Read the full response body
        body = b""
        async for chunk in response.body_iterator:
            body += chunk

        # Inject auth.js right after the opening <head> tag
        if b"<head>" in body:
            body = body.replace(b"<head>", b"<head>" + AUTH_SCRIPT_TAG, 1)

        # Rebuild the response with correct Content-Length
        new_headers = dict(response.headers)
        new_headers["content-length"] = str(len(body))

        return Response(
            content=body,
            status_code=response.status_code,
            headers=new_headers,
            media_type=response.media_type,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    yield
    shutdown_executor(wait=True)


app = FastAPI(lifespan=lifespan)

# CORS Configuration
if CORS_ORIGINS == "*":
    origins = ["*"]
else:
    origins = [origin.strip() for origin in CORS_ORIGINS.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True if CORS_ORIGINS != "*" else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth script injection — must be added AFTER CORSMiddleware so it runs first
app.add_middleware(AuthScriptMiddleware)

# Include Routers
app.include_router(screens.router)
app.include_router(auth.router)
app.include_router(decks.router)
app.include_router(folders.router)
app.include_router(stories.router)
app.include_router(cards.router)
app.include_router(system.router)
app.include_router(pdfs.router)
app.include_router(jobs.router)

# Mount Static
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host=host, port=port)
