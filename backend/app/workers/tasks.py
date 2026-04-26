from __future__ import annotations

import asyncio

from celery.utils.log import get_task_logger

from app.services.export_service import execute_export_job
from app.services.processing_service import execute_processing_job
from app.workers.celery_app import celery_app

logger = get_task_logger(__name__)


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 2})
def process_job_task(self, job_id: str) -> None:
    logger.info("processing job started", extra={"job_id": job_id, "task_id": self.request.id})
    asyncio.run(execute_processing_job(job_id))


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 2})
def export_project_task(self, export_id: str) -> None:
    logger.info("export job started", extra={"export_id": export_id, "task_id": self.request.id})
    asyncio.run(execute_export_job(export_id))

