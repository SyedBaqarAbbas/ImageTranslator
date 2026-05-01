from __future__ import annotations

import io
import zipfile

from fastapi import status
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.enums import AssetKind, ExportFormat, JobStatus, ProjectStatus
from app.core.errors import AppError
from app.db.base import utcnow
from app.db.session import AsyncSessionLocal
from app.models import ExportJob, FileAsset, Page, Project
from app.schemas.job import ExportRequest
from app.services.asset_service import AssetService
from app.services.project_service import ProjectService
from app.utils.files import safe_filename


class ExportService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_export_job(
        self,
        user_id: str,
        project_id: str,
        payload: ExportRequest,
    ) -> ExportJob:
        project = await ProjectService(self.session).get_project(user_id, project_id)
        job = ExportJob(
            user_id=user_id,
            project_id=project.id,
            format=payload.format.value,
            settings=payload.model_dump(mode="json"),
        )
        self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)
        await _dispatch_export_job(job.id)
        await self.session.refresh(job)
        return await self.get_export(user_id, job.id)

    async def get_export(self, user_id: str, export_id: str) -> ExportJob:
        export = await self.session.scalar(
            select(ExportJob)
            .options(selectinload(ExportJob.asset))
            .join(Project, Project.id == ExportJob.project_id)
            .where(ExportJob.id == export_id, Project.user_id == user_id)
        )
        if not export:
            raise AppError("export_not_found", "Export not found.", status.HTTP_404_NOT_FOUND)
        return export


async def _dispatch_export_job(export_id: str) -> None:
    if settings.celery_task_always_eager:
        await execute_export_job(export_id, raise_on_failure=False)
        return

    from app.workers.tasks import export_project_task

    export_project_task.delay(export_id)


async def execute_export_job(export_id: str, *, raise_on_failure: bool = True) -> None:
    async with AsyncSessionLocal() as session:
        export = await session.get(ExportJob, export_id)
        if export is None:
            return
        try:
            export.status = JobStatus.RUNNING.value
            export.started_at = utcnow()
            export.progress = 5
            await session.commit()

            project = await session.get(Project, export.project_id)
            if project is None:
                raise AppError("project_not_found", "Project not found.")
            payload = export.settings or {}
            page_ids = payload.get("page_ids")
            stmt = select(Page).where(Page.project_id == project.id).order_by(Page.page_number)
            if page_ids:
                stmt = stmt.where(Page.id.in_(page_ids))
            pages = list(await session.scalars(stmt))
            if not pages:
                raise AppError(
                    "no_pages",
                    (
                        "No pages are available to export. Upload at least one page, "
                        "process it, then return to Export."
                    ),
                )

            assets = AssetService(session)
            translated_payloads: list[tuple[str, bytes]] = []
            original_payloads: list[tuple[str, bytes]] = []
            include_originals = bool(payload.get("include_originals"))
            for index, page in enumerate(pages, start=1):
                rendered_asset_id = page.final_asset_id or page.preview_asset_id
                if rendered_asset_id:
                    rendered_asset = await session.get(FileAsset, rendered_asset_id)
                    if rendered_asset is not None:
                        data = await assets.read_asset_bytes(rendered_asset)
                        translated_payloads.append((f"page-{page.page_number:04d}.png", data))

                if include_originals and page.original_asset_id:
                    original_asset = await session.get(FileAsset, page.original_asset_id)
                    if original_asset is not None:
                        data = await assets.read_asset_bytes(original_asset)
                        original_payloads.append(
                            (_original_export_path(page, original_asset), data)
                        )

                export.progress = 5 + int(index / len(pages) * 60)
                await session.commit()

            if not translated_payloads:
                raise AppError(
                    "no_rendered_pages",
                    (
                        "No rendered pages were available to export. Process the project "
                        "first, then return to Export."
                    ),
                )

            export_format = export.format
            if export_format == ExportFormat.PDF.value:
                data = _build_pdf(translated_payloads)
                filename = _export_filename(payload.get("filename"), project.name, "pdf")
                content_type = "application/pdf"
            elif export_format == ExportFormat.IMAGES.value:
                data = _build_zip(translated_payloads + original_payloads)
                filename = _export_filename(payload.get("filename"), project.name, "zip")
                content_type = "application/zip"
            else:
                zip_payloads = [
                    (f"translated/{filename}", image_bytes)
                    for filename, image_bytes in translated_payloads
                ]
                data = _build_zip(zip_payloads + original_payloads)
                filename = _export_filename(payload.get("filename"), project.name, "zip")
                content_type = "application/zip"

            asset = await assets.create_asset(
                user_id=project.user_id,
                project_id=project.id,
                data=data,
                filename=filename,
                content_type=content_type,
                kind=AssetKind.EXPORT,
                key_prefix=f"projects/{project.id}/export",
            )
            export.asset_id = asset.id
            export.status = JobStatus.SUCCEEDED.value
            export.progress = 100
            export.completed_at = utcnow()
            project.status = ProjectStatus.EXPORT_READY.value
            await session.commit()
        except Exception as exc:
            export.status = JobStatus.FAILED.value
            export.error_message = str(exc)
            export.completed_at = utcnow()
            await session.commit()
            if raise_on_failure:
                raise


def _build_zip(image_payloads: list[tuple[str, bytes]]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for filename, data in image_payloads:
            archive.writestr(filename, data)
    return output.getvalue()


def _export_filename(requested: str | None, project_name: str, extension: str) -> str:
    base = (requested or f"{project_name}-translated").strip() or f"{project_name}-translated"
    suffix = f".{extension}"
    return base if base.lower().endswith(suffix) else f"{base}{suffix}"


def _original_export_path(page: Page, asset: FileAsset) -> str:
    filename = safe_filename(asset.filename)
    return f"originals/page-{page.page_number:04d}-{filename}"


def _build_pdf(image_payloads: list[tuple[str, bytes]]) -> bytes:
    images: list[Image.Image] = []
    for _, data in image_payloads:
        image = Image.open(io.BytesIO(data)).convert("RGB")
        images.append(image)
    output = io.BytesIO()
    first, rest = images[0], images[1:]
    first.save(output, format="PDF", save_all=True, append_images=rest)
    for image in images:
        image.close()
    return output.getvalue()
