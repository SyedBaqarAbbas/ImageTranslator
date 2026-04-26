from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_session
from app.models import ExportJob, ProcessingJob, Project, User
from app.services.project_service import ProjectService

router = APIRouter(tags=["events"])


@router.get("/projects/{project_id}/events")
async def project_events(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    await ProjectService(session).get_project(current_user.id, project_id)

    async def stream():
        while True:
            project = await session.get(Project, project_id)
            jobs = list(
                await session.scalars(
                    select(ProcessingJob)
                    .where(ProcessingJob.project_id == project_id)
                    .order_by(ProcessingJob.created_at.desc())
                    .limit(5)
                )
            )
            exports = list(
                await session.scalars(
                    select(ExportJob)
                    .where(ExportJob.project_id == project_id)
                    .order_by(ExportJob.created_at.desc())
                    .limit(5)
                )
            )
            payload = {
                "project": {"id": project_id, "status": project.status if project else "missing"},
                "jobs": [
                    {"id": job.id, "type": job.job_type, "status": job.status, "progress": job.progress}
                    for job in jobs
                ],
                "exports": [
                    {"id": job.id, "format": job.format, "status": job.status, "progress": job.progress}
                    for job in exports
                ],
            }
            yield f"event: project_progress\ndata: {json.dumps(payload)}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(stream(), media_type="text/event-stream")

