from __future__ import annotations

from fastapi import status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.enums import (
    AssetKind,
    JobStatus,
    JobType,
    PageStatus,
    ProjectStatus,
    ReplacementMode,
    TextRegionStatus,
)
from app.core.errors import AppError
from app.db.base import utcnow
from app.db.session import AsyncSessionLocal
from app.models import FileAsset, Page, ProcessingJob, Project, TextRegion, TranslationSettings
from app.providers import (
    RenderRegion,
    get_ocr_provider,
    get_render_engine,
    get_translation_provider,
)
from app.schemas.job import ProcessProjectRequest, ReprocessPageRequest
from app.schemas.region import RetranslateRequest
from app.services.asset_service import AssetService
from app.services.project_service import ProjectService
from app.utils.images import normalize_image_bytes


class ProcessingService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_project_job(
        self,
        user_id: str,
        project_id: str,
        payload: ProcessProjectRequest,
    ) -> ProcessingJob:
        project = await ProjectService(self.session).get_project(user_id, project_id)
        page_count = await ProjectService(self.session).page_count(project.id)
        if page_count == 0:
            raise AppError("project_has_no_pages", "Upload at least one page before processing.")
        job = ProcessingJob(
            project_id=project.id,
            job_type=JobType.PROCESS_PROJECT.value,
            result={"page_ids": payload.page_ids, "force": payload.force},
        )
        self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)
        await _dispatch_processing_job(job.id)
        await self.session.refresh(job)
        return job

    async def create_page_job(
        self,
        user_id: str,
        page_id: str,
        payload: ReprocessPageRequest,
    ) -> ProcessingJob:
        page = await self._get_page_for_user(user_id, page_id)
        job = ProcessingJob(
            project_id=page.project_id,
            page_id=page.id,
            job_type=JobType.PROCESS_PAGE.value,
            result=payload.model_dump(),
        )
        self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)
        await _dispatch_processing_job(job.id)
        await self.session.refresh(job)
        return job

    async def create_rerender_page_job(self, user_id: str, page_id: str) -> ProcessingJob:
        page = await self._get_page_for_user(user_id, page_id)
        job = ProcessingJob(
            project_id=page.project_id,
            page_id=page.id,
            job_type=JobType.RERENDER_PAGE.value,
        )
        self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)
        await _dispatch_processing_job(job.id)
        await self.session.refresh(job)
        return job

    async def create_retranslate_region_job(
        self,
        user_id: str,
        region_id: str,
        payload: RetranslateRequest,
    ) -> ProcessingJob:
        region = await self._get_region_for_user(user_id, region_id)
        page = await self.session.get(Page, region.page_id)
        if page is None:
            raise AppError("page_not_found", "Page not found.", status.HTTP_404_NOT_FOUND)
        job = ProcessingJob(
            project_id=page.project_id,
            page_id=page.id,
            region_id=region.id,
            job_type=JobType.RETRANSLATE_REGION.value,
            result=payload.model_dump(exclude_unset=True),
        )
        self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)
        await _dispatch_processing_job(job.id)
        await self.session.refresh(job)
        return job

    async def create_rerender_region_job(self, user_id: str, region_id: str) -> ProcessingJob:
        region = await self._get_region_for_user(user_id, region_id)
        page = await self.session.get(Page, region.page_id)
        if page is None:
            raise AppError("page_not_found", "Page not found.", status.HTTP_404_NOT_FOUND)
        job = ProcessingJob(
            project_id=page.project_id,
            page_id=page.id,
            region_id=region.id,
            job_type=JobType.RERENDER_PAGE.value,
            result={"region_id": region.id},
        )
        self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)
        await _dispatch_processing_job(job.id)
        await self.session.refresh(job)
        return job

    async def list_jobs(self, user_id: str, project_id: str) -> list[ProcessingJob]:
        await ProjectService(self.session).get_project(user_id, project_id)
        result = await self.session.scalars(
            select(ProcessingJob)
            .where(ProcessingJob.project_id == project_id)
            .order_by(ProcessingJob.created_at.desc())
        )
        return list(result)

    async def get_job(self, user_id: str, job_id: str) -> ProcessingJob:
        job = await self.session.scalar(
            select(ProcessingJob)
            .join(Project, Project.id == ProcessingJob.project_id)
            .where(ProcessingJob.id == job_id, Project.user_id == user_id)
        )
        if not job:
            raise AppError("job_not_found", "Job not found.", status.HTTP_404_NOT_FOUND)
        return job

    async def _get_page_for_user(self, user_id: str, page_id: str) -> Page:
        page = await self.session.scalar(
            select(Page)
            .join(Project, Project.id == Page.project_id)
            .where(Page.id == page_id, Project.user_id == user_id)
        )
        if not page:
            raise AppError("page_not_found", "Page not found.", status.HTTP_404_NOT_FOUND)
        return page

    async def _get_region_for_user(self, user_id: str, region_id: str) -> TextRegion:
        region = await self.session.scalar(
            select(TextRegion)
            .join(Page, Page.id == TextRegion.page_id)
            .join(Project, Project.id == Page.project_id)
            .where(TextRegion.id == region_id, Project.user_id == user_id)
        )
        if not region:
            raise AppError("region_not_found", "Text region not found.", status.HTTP_404_NOT_FOUND)
        return region


async def _dispatch_processing_job(job_id: str) -> None:
    if settings.celery_task_always_eager:
        await execute_processing_job(job_id)
        return

    from app.workers.tasks import process_job_task

    async with AsyncSessionLocal() as session:
        job = await session.get(ProcessingJob, job_id)
        if job is None:
            return
        async_result = process_job_task.delay(job_id)
        job.celery_task_id = async_result.id
        await session.commit()


async def execute_processing_job(job_id: str) -> None:
    async with AsyncSessionLocal() as session:
        job = await session.scalar(
            select(ProcessingJob)
            .options(selectinload(ProcessingJob.project))
            .where(ProcessingJob.id == job_id)
        )
        if job is None:
            return
        try:
            await _mark_job_running(session, job)
            if job.job_type == JobType.PROCESS_PROJECT.value:
                await _process_project(session, job)
            elif job.job_type == JobType.PROCESS_PAGE.value:
                await _process_single_page(session, job)
            elif job.job_type == JobType.RETRANSLATE_REGION.value:
                await _retranslate_region(session, job)
            elif job.job_type == JobType.RERENDER_PAGE.value:
                await _rerender_page_for_job(session, job)
            else:
                raise AppError("unsupported_job_type", f"Unsupported job type: {job.job_type}")
            job.status = JobStatus.SUCCEEDED.value
            job.progress = 100
            job.completed_at = utcnow()
            await session.commit()
        except Exception as exc:
            await _mark_job_failed(session, job, exc)
            raise


async def _mark_job_running(session: AsyncSession, job: ProcessingJob) -> None:
    job.status = JobStatus.RUNNING.value
    job.started_at = utcnow()
    job.attempts += 1
    job.stage = "starting"
    await session.commit()


async def _mark_job_failed(session: AsyncSession, job: ProcessingJob, exc: Exception) -> None:
    job.status = JobStatus.FAILED.value
    job.error_code = exc.__class__.__name__
    job.error_message = str(exc)
    job.completed_at = utcnow()
    project = await session.get(Project, job.project_id)
    if project:
        project.status = ProjectStatus.FAILED.value
        project.failure_reason = str(exc)
    if job.page_id:
        page = await session.get(Page, job.page_id)
        if page:
            page.status = PageStatus.FAILED.value
            page.failure_reason = str(exc)
    await session.commit()


async def _mark_page_failed(session: AsyncSession, page_id: str, exc: Exception) -> None:
    await session.rollback()
    page = await session.get(Page, page_id)
    if page is None:
        return
    page.status = PageStatus.FAILED.value
    page.failure_reason = str(exc)
    await session.commit()


async def _process_project(session: AsyncSession, job: ProcessingJob) -> None:
    project = await session.scalar(
        select(Project).options(selectinload(Project.settings)).where(Project.id == job.project_id)
    )
    if project is None:
        raise AppError("project_not_found", "Project not found.")
    project.status = ProjectStatus.PROCESSING.value
    job.stage = "loading_pages"
    await session.commit()

    page_ids = (job.result or {}).get("page_ids")
    stmt = select(Page).where(Page.project_id == project.id).order_by(Page.page_number)
    if page_ids:
        stmt = stmt.where(Page.id.in_(page_ids))
    pages = list(await session.scalars(stmt))
    if not pages:
        raise AppError("no_pages", "No pages matched this processing job.")

    for index, page in enumerate(pages, start=1):
        await _process_page(session, project, page)
        job.progress = int(index / len(pages) * 95)
        job.stage = f"processed_page_{page.page_number}"
        await session.commit()

    project.status = ProjectStatus.REVIEW_REQUIRED.value
    job.stage = "complete"


async def _process_single_page(session: AsyncSession, job: ProcessingJob) -> None:
    page = await session.get(Page, job.page_id)
    if page is None:
        raise AppError("page_not_found", "Page not found.")
    project = await session.scalar(
        select(Project).options(selectinload(Project.settings)).where(Project.id == page.project_id)
    )
    if project is None:
        raise AppError("project_not_found", "Project not found.")
    await _process_page(session, project, page)
    project.status = ProjectStatus.REVIEW_REQUIRED.value


async def _process_page(session: AsyncSession, project: Project, page: Page) -> None:
    page_id = page.id
    try:
        await _process_page_inner(session, project, page)
    except Exception as exc:
        await _mark_page_failed(session, page_id, exc)
        raise


async def _process_page_inner(session: AsyncSession, project: Project, page: Page) -> None:
    if not page.original_asset_id:
        raise AppError("page_missing_original", f"Page {page.id} has no original asset.")

    assets = AssetService(session)
    original_asset = await session.get(FileAsset, page.original_asset_id)
    if original_asset is None:
        raise AppError("asset_not_found", "Original image asset not found.")

    page.status = PageStatus.PREPROCESSING.value
    page.progress = 5
    await session.commit()

    original_bytes = await assets.read_asset_bytes(original_asset)
    normalized = normalize_image_bytes(original_bytes)
    processed_asset = await assets.create_asset(
        user_id=project.user_id,
        project_id=project.id,
        page_id=page.id,
        data=normalized,
        filename=f"page-{page.page_number:04d}-processed.png",
        content_type="image/png",
        kind=AssetKind.PROCESSED,
        key_prefix=f"projects/{project.id}/processed",
    )
    page.processed_asset_id = processed_asset.id
    page.status = PageStatus.OCR_RUNNING.value
    page.progress = 20
    await session.commit()

    settings = await _settings_for_project(session, project)
    ocr_regions = await get_ocr_provider().detect_and_read(normalized, settings.source_language)

    await session.execute(delete(TextRegion).where(TextRegion.page_id == page.id))
    page.status = PageStatus.TRANSLATING.value
    page.progress = 45
    await session.commit()

    texts = [region.text for region in ocr_regions]
    translations = await get_translation_provider().translate_many(
        texts,
        source_language=settings.source_language,
        target_language=settings.target_language,
        tone=settings.translation_tone,
        context={"project_id": project.id, "page_id": page.id},
    )

    render_regions: list[RenderRegion] = []
    for region, translation in zip(ocr_regions, translations, strict=False):
        status_value = (
            TextRegionStatus.OCR_LOW_CONFIDENCE.value
            if region.confidence < 0.75
            else TextRegionStatus.TRANSLATED.value
        )
        db_region = TextRegion(
            page_id=page.id,
            region_index=region.region_index,
            region_type=region.region_type,
            bounding_box=region.bounding_box,
            polygon=region.polygon,
            detected_text=region.text,
            detected_language=translation.detected_language or region.language,
            translated_text=translation.translated_text,
            ocr_confidence=region.confidence,
            translation_confidence=translation.confidence,
            render_style={"align": "center", "padding": 6},
            status=status_value,
        )
        session.add(db_region)
        render_regions.append(
            RenderRegion(
                bounding_box=region.bounding_box,
                original_text=region.text,
                translated_text=translation.translated_text,
                render_style=db_region.render_style,
            )
        )

    page.status = PageStatus.RENDERING.value
    page.progress = 75
    await session.commit()

    renderer = get_render_engine()
    cleaned = await renderer.clean_page(normalized, render_regions)
    replace_modes = {ReplacementMode.REPLACE.value, ReplacementMode.BILINGUAL.value}
    render_source = (
        cleaned
        if settings.replacement_mode in replace_modes
        else normalized
    )
    final = await renderer.render_page(render_source, render_regions, settings.replacement_mode)

    cleaned_asset = await assets.create_asset(
        user_id=project.user_id,
        project_id=project.id,
        page_id=page.id,
        data=cleaned,
        filename=f"page-{page.page_number:04d}-cleaned.png",
        content_type="image/png",
        kind=AssetKind.CLEANED,
        key_prefix=f"projects/{project.id}/processed",
    )
    final_asset = await assets.create_asset(
        user_id=project.user_id,
        project_id=project.id,
        page_id=page.id,
        data=final,
        filename=f"page-{page.page_number:04d}-final.png",
        content_type="image/png",
        kind=AssetKind.FINAL,
        key_prefix=f"projects/{project.id}/final",
    )
    preview_asset = await assets.create_asset(
        user_id=project.user_id,
        project_id=project.id,
        page_id=page.id,
        data=final,
        filename=f"page-{page.page_number:04d}-preview.png",
        content_type="image/png",
        kind=AssetKind.PREVIEW,
        key_prefix=f"projects/{project.id}/preview",
    )

    page.cleaned_asset_id = cleaned_asset.id
    page.final_asset_id = final_asset.id
    page.preview_asset_id = preview_asset.id
    page.status = PageStatus.REVIEW_REQUIRED.value
    page.progress = 100
    await session.commit()


async def _retranslate_region(session: AsyncSession, job: ProcessingJob) -> None:
    region = await session.get(TextRegion, job.region_id)
    if region is None:
        raise AppError("region_not_found", "Text region not found.")
    page = await session.get(Page, region.page_id)
    if page is None:
        raise AppError("page_not_found", "Page not found.")
    project = await session.scalar(
        select(Project).options(selectinload(Project.settings)).where(Project.id == page.project_id)
    )
    if project is None:
        raise AppError("project_not_found", "Project not found.")

    settings = await _settings_for_project(session, project)
    source_text = (
        (job.result or {}).get("source_text")
        or region.user_text
        or region.detected_text
        or ""
    )
    if not source_text:
        raise AppError("region_has_no_text", "Region has no source text to translate.")
    target_language = (job.result or {}).get("target_language") or settings.target_language
    tone = (job.result or {}).get("tone") or settings.translation_tone

    region.status = TextRegionStatus.TRANSLATING.value
    job.stage = "translating_region"
    job.progress = 40
    await session.commit()

    result = (
        await get_translation_provider().translate_many(
            [source_text],
            source_language=settings.source_language,
            target_language=target_language,
            tone=tone,
            context={"project_id": project.id, "page_id": page.id, "region_id": region.id},
        )
    )[0]
    region.translated_text = result.translated_text
    region.translation_confidence = result.confidence
    region.status = TextRegionStatus.TRANSLATED.value
    job.progress = 65
    await session.commit()
    await _rerender_page(session, project, page)


async def _rerender_page_for_job(session: AsyncSession, job: ProcessingJob) -> None:
    page = await session.get(Page, job.page_id)
    if page is None:
        raise AppError("page_not_found", "Page not found.")
    project = await session.scalar(
        select(Project).options(selectinload(Project.settings)).where(Project.id == page.project_id)
    )
    if project is None:
        raise AppError("project_not_found", "Project not found.")
    job.stage = "rerendering_page"
    job.progress = 50
    await session.commit()
    await _rerender_page(session, project, page)


async def _rerender_page(session: AsyncSession, project: Project, page: Page) -> None:
    assets = AssetService(session)
    source_asset_id = page.processed_asset_id or page.original_asset_id
    if not source_asset_id:
        raise AppError("page_missing_image", "Page has no image to render.")
    source_asset = await session.get(FileAsset, source_asset_id)
    if source_asset is None:
        raise AppError("asset_not_found", "Source image asset not found.")
    source_bytes = await assets.read_asset_bytes(source_asset)

    regions = list(
        await session.scalars(
            select(TextRegion)
            .where(
                TextRegion.page_id == page.id,
                TextRegion.status != TextRegionStatus.REJECTED.value,
            )
            .order_by(TextRegion.region_index)
        )
    )
    render_regions = [
        RenderRegion(
            bounding_box=region.bounding_box,
            original_text=region.detected_text,
            translated_text=region.user_text or region.translated_text,
            render_style=region.render_style,
        )
        for region in regions
    ]
    settings = await _settings_for_project(session, project)
    renderer = get_render_engine()
    cleaned = await renderer.clean_page(source_bytes, render_regions)
    replace_modes = {ReplacementMode.REPLACE.value, ReplacementMode.BILINGUAL.value}
    render_source = (
        cleaned
        if settings.replacement_mode in replace_modes
        else source_bytes
    )
    final = await renderer.render_page(render_source, render_regions, settings.replacement_mode)

    cleaned_asset = await assets.create_asset(
        user_id=project.user_id,
        project_id=project.id,
        page_id=page.id,
        data=cleaned,
        filename=f"page-{page.page_number:04d}-cleaned.png",
        content_type="image/png",
        kind=AssetKind.CLEANED,
        key_prefix=f"projects/{project.id}/processed",
    )
    final_asset = await assets.create_asset(
        user_id=project.user_id,
        project_id=project.id,
        page_id=page.id,
        data=final,
        filename=f"page-{page.page_number:04d}-final.png",
        content_type="image/png",
        kind=AssetKind.FINAL,
        key_prefix=f"projects/{project.id}/final",
    )
    preview_asset = await assets.create_asset(
        user_id=project.user_id,
        project_id=project.id,
        page_id=page.id,
        data=final,
        filename=f"page-{page.page_number:04d}-preview.png",
        content_type="image/png",
        kind=AssetKind.PREVIEW,
        key_prefix=f"projects/{project.id}/preview",
    )
    page.cleaned_asset_id = cleaned_asset.id
    page.final_asset_id = final_asset.id
    page.preview_asset_id = preview_asset.id
    page.status = PageStatus.REVIEW_REQUIRED.value
    page.progress = 100
    for region in regions:
        if region.status != TextRegionStatus.USER_EDITED.value:
            region.status = TextRegionStatus.RENDERED.value
    await session.commit()


async def _settings_for_project(session: AsyncSession, project: Project) -> TranslationSettings:
    settings = await session.scalar(
        select(TranslationSettings).where(TranslationSettings.project_id == project.id)
    )
    if settings is None:
        settings = TranslationSettings(
            project_id=project.id,
            source_language=project.source_language,
            target_language=project.target_language,
            translation_tone=project.translation_tone,
            replacement_mode=project.replacement_mode,
            reading_direction=project.reading_direction,
        )
        session.add(settings)
        await session.flush()
    return settings
