from __future__ import annotations

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "image_translator",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_always_eager=settings.celery_task_always_eager,
    task_eager_propagates=True,
    task_routes={
        "app.workers.tasks.process_job_task": {"queue": "processing"},
        "app.workers.tasks.export_project_task": {"queue": "exports"},
    },
)

