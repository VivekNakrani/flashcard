"""
PDF Tasks (Celery)
==================
Celery tasks for background PDF processing.
Currently handles thumbnail generation which can block the upload response
for large PDFs.
"""

import logging
from io import BytesIO

from celery import shared_task

from services.storage import r2_client, R2_BUCKET_NAME, pdf_thumbnail_key
from services.database import get_db

logger = logging.getLogger(__name__)


def _update_job_status(reference_id: str, job_type: str, user_id: str, status: str, error: str | None = None):
    """Write / update a job_status row in Supabase."""
    try:
        db = get_db()
        payload = {
            "user_id": user_id,
            "job_type": job_type,
            "reference_id": reference_id,
            "status": status,
        }
        if error:
            payload["error"] = error[:500]

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


@shared_task(
    name="tasks.pdf.generate_thumbnail",
    bind=True,
    max_retries=2,
    default_retry_delay=15,
    acks_late=True,
)
def generate_thumbnail(self, pdf_id: str, user_id: str, pdf_name: str, content_bytes: bytes):
    """
    Render the first page of a PDF as a thumbnail and upload it to R2.

    Args:
        pdf_id:       The UUID of the PDF record in the `pdfs` table.
        user_id:      The owner's user ID.
        pdf_name:     The safe PDF name (used for logging only).
        content_bytes: The raw PDF file bytes.
    """
    _update_job_status(pdf_id, "pdf_thumb", user_id, "processing")

    try:
        try:
            import pypdfium2 as pdfium
            from PIL import Image
        except ImportError:
            logger.warning("pypdfium2 or Pillow not available — skipping thumbnail")
            _update_job_status(pdf_id, "pdf_thumb", user_id, "failed", "pypdfium2 not installed")
            return

        if not r2_client or not R2_BUCKET_NAME:
            _update_job_status(pdf_id, "pdf_thumb", user_id, "failed", "R2 not configured")
            return

        # Render first page
        doc = pdfium.PdfDocument(BytesIO(content_bytes))
        if len(doc) == 0:
            _update_job_status(pdf_id, "pdf_thumb", user_id, "failed", "Empty PDF")
            return

        page = doc[0]
        image = page.render(scale=3.0).to_pil()
        image.thumbnail((1024, 1024), Image.LANCZOS)

        buf = BytesIO()
        image.save(buf, format="JPEG", quality=95, subsampling=0, optimize=True)

        # Upload thumbnail to user-scoped path
        thumb_key = pdf_thumbnail_key(pdf_id, user_id)
        r2_client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=thumb_key,
            Body=buf.getvalue(),
            ContentType="image/jpeg",
        )

        # Update the pdfs table with the thumbnail key
        db = get_db()
        db.table("pdfs").update({"thumbnail_key": thumb_key}).eq("id", pdf_id).execute()

        _update_job_status(pdf_id, "pdf_thumb", user_id, "done")
        logger.info("Thumbnail generated for PDF '%s' (%s)", pdf_name, pdf_id)

    except Exception as exc:
        error_msg = str(exc)
        logger.error("generate_thumbnail task failed for '%s': %s", pdf_name, error_msg)
        _update_job_status(pdf_id, "pdf_thumb", user_id, "failed", error_msg)
        raise self.retry(exc=exc)
