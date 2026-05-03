from __future__ import annotations

import pytest

import app.workers.tasks as worker_tasks
from app.workers.celery_app import celery_app


def test_celery_app_config_uses_expected_queues() -> None:
    assert celery_app.main == "image_translator"
    assert celery_app.conf.task_serializer == "json"
    assert celery_app.conf.task_routes["app.workers.tasks.process_job_task"]["queue"] == "processing"
    assert celery_app.conf.task_routes["app.workers.tasks.export_project_task"]["queue"] == "exports"


def test_worker_tasks_dispatch_to_async_services(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str]] = []

    async def fake_process(job_id: str) -> None:
        calls.append(("process", job_id))

    async def fake_export(export_id: str) -> None:
        calls.append(("export", export_id))

    monkeypatch.setattr(worker_tasks, "execute_processing_job", fake_process)
    monkeypatch.setattr(worker_tasks, "execute_export_job", fake_export)

    worker_tasks.process_job_task.run("job-1")
    worker_tasks.export_project_task.run("export-1")

    assert calls == [("process", "job-1"), ("export", "export-1")]
