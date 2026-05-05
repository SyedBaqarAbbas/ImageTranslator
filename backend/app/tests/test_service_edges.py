from __future__ import annotations

import io
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from fastapi import UploadFile
from PIL import Image
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.datastructures import Headers

import app.services.export_service as export_service_module
import app.services.processing_service as processing_service_module
from app.api.deps import PUBLIC_USER_PASSWORD_PLACEHOLDER, get_public_user
from app.api.routes.events import project_events
from app.core.config import settings
from app.core.enums import (
    AssetKind,
    ExportFormat,
    JobStatus,
    JobType,
    PageStatus,
    ProjectStatus,
    ReadingDirection,
    ReplacementMode,
)
from app.core.errors import AppError
from app.db.base import Base
from app.models import (
    ExportJob,
    FileAsset,
    Page,
    ProcessingJob,
    Project,
    TextRegion,
    TranslationSettings,
    User,
)
from app.providers.ocr import OCRRegion
from app.providers.translation import TranslationResult
from app.schemas.job import ExportRequest, ProcessProjectRequest, ReprocessPageRequest
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.schemas.region import RetranslateRequest, TextRegionUpdate
from app.schemas.settings import TranslationSettingsUpdate
from app.services.asset_service import AssetService
from app.services.export_service import ExportService, execute_export_job
from app.services.page_service import PageService
from app.services.processing_service import (
    ProcessingService,
    _process_page,
    _process_page_inner,
    _process_project,
    _process_single_page,
    _rerender_page,
    _rerender_page_for_job,
    _retranslate_region,
    execute_processing_job,
)
from app.services.project_service import ProjectService
from app.services.region_service import RegionService
from app.services.upload_service import UploadService
from app.storage.factory import get_storage_backend


@pytest.fixture
async def db_session(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'service-test.db'}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        import app.models  # noqa: F401

        await conn.run_sync(Base.metadata.create_all)

    monkeypatch.setattr(settings, "local_storage_path", tmp_path / "storage")
    monkeypatch.setattr(settings, "public_base_url", "http://testserver")
    monkeypatch.setattr(settings, "celery_task_always_eager", True)
    monkeypatch.setattr(export_service_module, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(processing_service_module, "AsyncSessionLocal", session_factory)
    get_storage_backend.cache_clear()

    async with session_factory() as session:
        yield session

    get_storage_backend.cache_clear()
    await engine.dispose()


def _png_bytes() -> bytes:
    image = Image.new("RGB", (32, 24), "white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _upload_file(filename: str, data: bytes, content_type: str) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(data),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


async def _user(session: AsyncSession, *, active: bool = True) -> User:
    user = User(
        email=f"user-{id(session)}-{str(active).lower()}@example.com",
        password_hash="unused-password-hash",
        display_name="Service User",
        is_active=active,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


class FakeOCRProvider:
    async def detect_and_read(
        self,
        image_bytes: bytes,
        source_language: str = "auto",
    ) -> list[OCRRegion]:
        assert image_bytes
        return [
            OCRRegion(
                region_index=0,
                bounding_box={"x": 1, "y": 2, "width": 20, "height": 12},
                polygon=None,
                text="高信頼",
                language=None if source_language == "auto" else source_language,
                confidence=0.95,
                region_type="speech",
            ),
            OCRRegion(
                region_index=1,
                bounding_box={"x": 8, "y": 18, "width": 22, "height": 12},
                polygon=[[8, 18], [30, 18], [30, 30], [8, 30]],
                text="低信頼",
                language="ja",
                confidence=0.5,
                region_type="sfx",
            ),
        ]


class FakeTranslationProvider:
    async def translate_many(
        self,
        texts: list[str],
        source_language: str,
        target_language: str,
        tone: str = "natural",
        context: dict | None = None,
    ) -> list[TranslationResult]:
        assert context
        return [
            TranslationResult(
                source_text=text,
                translated_text=f"{target_language}:{tone}:{text}",
                detected_language=source_language if source_language != "auto" else "ja",
                confidence=0.88,
            )
            for text in texts
        ]


class FakeRenderEngine:
    async def clean_page(self, image_bytes: bytes, regions: list[object]) -> bytes:
        assert regions
        return image_bytes

    async def render_page(
        self,
        image_bytes: bytes,
        regions: list[object],
        replacement_mode: str = ReplacementMode.REPLACE.value,
    ) -> bytes:
        assert replacement_mode
        assert regions
        return image_bytes


async def _processed_project_fixture(
    session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[User, Project, Page, list[TextRegion]]:
    monkeypatch.setattr(processing_service_module, "get_ocr_provider", lambda: FakeOCRProvider())
    monkeypatch.setattr(
        processing_service_module,
        "get_translation_provider",
        lambda: FakeTranslationProvider(),
    )
    monkeypatch.setattr(processing_service_module, "get_render_engine", lambda: FakeRenderEngine())

    user = await _user(session)
    project = Project(
        user_id=user.id,
        name="Direct Processing Project",
        source_language="ja",
        target_language="en",
        translation_tone="dramatic",
        replacement_mode=ReplacementMode.BILINGUAL.value,
        status=ProjectStatus.READY.value,
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)

    original_asset = await AssetService(session).create_asset(
        user_id=user.id,
        project_id=project.id,
        data=_png_bytes(),
        filename="original.png",
        content_type="image/png",
        kind=AssetKind.ORIGINAL,
    )
    page = Page(
        project_id=project.id,
        page_number=1,
        original_asset_id=original_asset.id,
        width=32,
        height=24,
    )
    session.add(page)
    await session.commit()
    await session.refresh(page)

    await _process_page_inner(session, project, page)
    await session.refresh(page)
    regions = list(
        await session.scalars(
            select(TextRegion)
            .where(TextRegion.page_id == page.id)
            .order_by(TextRegion.region_index)
        )
    )
    return user, project, page, regions


@pytest.mark.asyncio
async def test_public_user_edges(db_session: AsyncSession) -> None:
    public_user = await get_public_user(db_session)
    same_public_user = await get_public_user(db_session)
    assert public_user.id == same_public_user.id
    assert public_user.email == settings.public_user_email.lower()
    assert public_user.password_hash == PUBLIC_USER_PASSWORD_PLACEHOLDER


@pytest.mark.asyncio
async def test_project_upload_page_asset_and_region_service_edges(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await _user(db_session)
    project_service = ProjectService(db_session)
    project = await project_service.create_project(
        user.id,
        ProjectCreate(name="Service Project", target_language="en"),
    )

    listed = await project_service.list_projects(user.id, limit=1, offset=0)
    assert [item.id for item in listed] == [project.id]

    updated = await project_service.update_project(
        user.id,
        project.id,
        ProjectUpdate(
            replacement_mode=ReplacementMode.OVERLAY,
            reading_direction=ReadingDirection.LTR,
        ),
    )
    assert updated.replacement_mode == ReplacementMode.OVERLAY.value
    assert updated.reading_direction == ReadingDirection.LTR.value

    await db_session.execute(
        delete(TranslationSettings).where(TranslationSettings.project_id == project.id)
    )
    await db_session.commit()
    db_session.expunge_all()
    recreated_settings = await project_service.update_settings(
        user.id,
        project.id,
        TranslationSettingsUpdate(source_language="ja", preserve_sfx=False),
    )
    assert recreated_settings.source_language == "ja"
    assert recreated_settings.preserve_sfx is False

    with pytest.raises(AppError) as no_files:
        await UploadService(db_session).upload_pages(user.id, project, [])
    assert no_files.value.code == "no_files"

    monkeypatch.setattr(settings, "max_project_pages", 0)
    project = await project_service.get_project(user.id, project.id)
    with pytest.raises(AppError) as too_many:
        await UploadService(db_session).upload_pages(
            user.id,
            project,
            [_upload_file("page.png", _png_bytes(), "image/png")],
        )
    assert too_many.value.code == "too_many_pages"

    monkeypatch.setattr(settings, "max_project_pages", 10)
    project = await project_service.get_project(user.id, project.id)
    pages = await UploadService(db_session).upload_pages(
        user.id,
        project,
        [_upload_file("page.png", _png_bytes(), "image/png")],
    )
    page = pages[0]
    assert page.page_number == 1
    assert await project_service.page_count(project.id) == 1
    assert (await PageService(db_session).list_pages(user.id, project.id))[0].id == page.id
    assert (await PageService(db_session).get_page(user.id, page.id)).original_asset_id

    asset = await AssetService(db_session).create_asset(
        user_id=user.id,
        project_id=project.id,
        page_id=page.id,
        data=b"not-an-image",
        filename="../unsafe name.png",
        content_type="image/png",
        kind=AssetKind.PREVIEW,
    )
    assert asset.filename == "unsafe_name.png"
    assert asset.width is None
    assert await AssetService(db_session).read_asset_bytes(asset) == b"not-an-image"
    assert "/api/v1/assets/by-key/" in await AssetService(db_session).download_url(asset)

    region_service = RegionService(db_session)
    active_region = TextRegion(
        page_id=page.id,
        region_index=1,
        bounding_box={"x": 1, "y": 2, "width": 30, "height": 20},
        detected_text="source",
        translated_text="target",
        status="translated",
    )
    rejected_region = TextRegion(
        page_id=page.id,
        region_index=2,
        bounding_box={"x": 5, "y": 6, "width": 30, "height": 20},
        detected_text="reject",
        translated_text="reject",
        status="rejected",
    )
    db_session.add_all([active_region, rejected_region])
    await db_session.commit()
    await db_session.refresh(active_region)

    assert [region.id for region in await region_service.list_page_regions(user.id, page.id)] == [
        active_region.id
    ]
    unchanged_status = await region_service.update_region(
        user.id,
        active_region.id,
        TextRegionUpdate(editable=False),
    )
    assert unchanged_status.status == "translated"
    edited = await region_service.update_region(
        user.id,
        active_region.id,
        TextRegionUpdate(
            bounding_box={"x": 3, "y": 4, "width": 31, "height": 21},
            render_style={"fontSize": 20},
        ),
    )
    assert edited.status == "user_edited"
    assert await region_service.delete_region(user.id, active_region.id) == page.id


@pytest.mark.asyncio
async def test_processing_service_missing_resource_edges(db_session: AsyncSession) -> None:
    user = await _user(db_session)
    project = Project(
        user_id=user.id,
        name="Broken Processing Project",
        target_language="en",
        status=ProjectStatus.READY.value,
    )
    page = Page(
        project=project,
        page_number=1,
        status=PageStatus.UPLOADED.value,
        progress=0,
    )
    db_session.add_all([project, page])
    await db_session.commit()
    await db_session.refresh(page)

    service = ProcessingService(db_session)
    with pytest.raises(AppError) as missing_page:
        await service._get_page_for_user(user.id, "missing-page")
    assert missing_page.value.code == "page_not_found"

    with pytest.raises(AppError) as missing_region:
        await service._get_region_for_user(user.id, "missing-region")
    assert missing_region.value.code == "region_not_found"

    with pytest.raises(AppError) as missing_job:
        await service.get_job(user.id, "missing-job")
    assert missing_job.value.code == "job_not_found"


@pytest.mark.asyncio
async def test_processing_service_create_job_methods_and_job_listing(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dispatched: list[str] = []

    async def fake_dispatch(job_id: str) -> None:
        dispatched.append(job_id)

    monkeypatch.setattr(processing_service_module, "_dispatch_processing_job", fake_dispatch)
    user = await _user(db_session)
    project = Project(user_id=user.id, name="Job Project", target_language="en")
    empty_project = Project(user_id=user.id, name="Empty Job Project", target_language="en")
    page = Page(project=project, page_number=1)
    db_session.add_all([project, empty_project, page])
    await db_session.commit()
    await db_session.refresh(project)
    await db_session.refresh(empty_project)
    await db_session.refresh(page)
    region = TextRegion(
        page_id=page.id,
        region_index=1,
        bounding_box={"x": 1, "y": 1, "width": 10, "height": 10},
        detected_text="source",
        translated_text="target",
    )
    db_session.add(region)
    await db_session.commit()
    await db_session.refresh(region)

    service = ProcessingService(db_session)
    with pytest.raises(AppError) as no_pages:
        await service.create_project_job(
            user.id,
            empty_project.id,
            ProcessProjectRequest(force=True),
        )
    assert no_pages.value.code == "project_has_no_pages"

    project_job = await service.create_project_job(
        user.id,
        project.id,
        ProcessProjectRequest(page_ids=[page.id], force=True),
    )
    page_job = await service.create_page_job(
        user.id,
        page.id,
        ReprocessPageRequest(rerun_ocr=False, rerun_translation=True, rerender=False),
    )
    rerender_page_job = await service.create_rerender_page_job(user.id, page.id)
    retranslate_job = await service.create_retranslate_region_job(
        user.id,
        region.id,
        RetranslateRequest(source_text="manual", target_language="en", tone="literal"),
    )
    rerender_region_job = await service.create_rerender_region_job(user.id, region.id)

    assert dispatched == [
        project_job.id,
        page_job.id,
        rerender_page_job.id,
        retranslate_job.id,
        rerender_region_job.id,
    ]
    assert page_job.result == {
        "rerun_ocr": False,
        "rerun_translation": True,
        "rerender": False,
    }
    assert retranslate_job.result == {
        "source_text": "manual",
        "target_language": "en",
        "tone": "literal",
    }
    assert rerender_region_job.result == {"region_id": region.id}
    assert (await service.get_job(user.id, project_job.id)).id == project_job.id
    assert len(await service.list_jobs(user.id, project.id)) == 5


@pytest.mark.asyncio
async def test_processing_inner_retranslate_rerender_and_execute_edges(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, project, page, regions = await _processed_project_fixture(db_session, monkeypatch)

    assert page.status == PageStatus.REVIEW_REQUIRED.value
    assert page.processed_asset_id
    assert page.cleaned_asset_id
    assert page.preview_asset_id
    assert page.final_asset_id
    assert [region.status for region in regions] == [
        "translated",
        "ocr_low_confidence",
    ]

    retranslate_job = ProcessingJob(
        project_id=project.id,
        page_id=page.id,
        region_id=regions[0].id,
        job_type=JobType.RETRANSLATE_REGION.value,
        result={"source_text": "manual source", "target_language": "en", "tone": "literal"},
    )
    db_session.add(retranslate_job)
    await db_session.commit()
    await db_session.refresh(retranslate_job)

    await _retranslate_region(db_session, retranslate_job)
    await db_session.refresh(retranslate_job)
    await db_session.refresh(regions[0])
    assert retranslate_job.progress == 65
    assert regions[0].translated_text == "en:literal:manual source"
    assert page.final_asset_id

    regions[0].status = "user_edited"
    regions[1].status = "translated"
    rerender_job = ProcessingJob(
        project_id=project.id,
        page_id=page.id,
        job_type=JobType.RERENDER_PAGE.value,
    )
    db_session.add(rerender_job)
    await db_session.commit()
    await db_session.refresh(rerender_job)

    await _rerender_page_for_job(db_session, rerender_job)
    await db_session.refresh(rerender_job)
    await db_session.refresh(regions[0])
    await db_session.refresh(regions[1])
    assert rerender_job.stage == "rerendering_page"
    assert regions[0].status == "user_edited"
    assert regions[1].status == "rendered"

    missing_job = ProcessingJob(project_id=project.id, job_type="unknown")
    db_session.add(missing_job)
    await db_session.commit()
    await db_session.refresh(missing_job)
    with pytest.raises(AppError, match="Unsupported job type"):
        await execute_processing_job(missing_job.id)
    await db_session.refresh(missing_job)
    assert missing_job.status == JobStatus.FAILED.value

    await execute_processing_job("missing-job-id")

    no_image_page = Page(project_id=project.id, page_number=2)
    db_session.add(no_image_page)
    await db_session.commit()
    with pytest.raises(AppError) as missing_original:
        await _process_page_inner(db_session, project, no_image_page)
    assert missing_original.value.code == "page_missing_original"

    orphan_region_job = ProcessingJob(
        project_id=project.id,
        page_id=page.id,
        region_id="missing-region",
        job_type=JobType.RETRANSLATE_REGION.value,
    )
    db_session.add(orphan_region_job)
    await db_session.commit()
    with pytest.raises(AppError) as missing_region:
        await _retranslate_region(db_session, orphan_region_job)
    assert missing_region.value.code == "region_not_found"


@pytest.mark.asyncio
async def test_processing_project_page_and_rerender_failure_branches(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(processing_service_module, "get_ocr_provider", lambda: FakeOCRProvider())
    monkeypatch.setattr(
        processing_service_module,
        "get_translation_provider",
        lambda: FakeTranslationProvider(),
    )
    monkeypatch.setattr(processing_service_module, "get_render_engine", lambda: FakeRenderEngine())
    user = await _user(db_session)
    project = Project(
        user_id=user.id,
        name="Project Branch Coverage",
        source_language="ja",
        target_language="en",
        replacement_mode=ReplacementMode.OVERLAY.value,
    )
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    project_id = project.id
    original_asset = await AssetService(db_session).create_asset(
        user_id=user.id,
        project_id=project_id,
        data=_png_bytes(),
        filename="source.png",
        content_type="image/png",
        kind=AssetKind.ORIGINAL,
    )
    page = Page(
        project_id=project_id,
        page_number=1,
        original_asset_id=original_asset.id,
        width=32,
        height=24,
    )
    db_session.add(page)
    await db_session.commit()
    await db_session.refresh(page)
    page_id = page.id

    project_job = ProcessingJob(
        project_id=project_id,
        job_type=JobType.PROCESS_PROJECT.value,
        result={"page_ids": [page.id]},
    )
    db_session.add(project_job)
    await db_session.commit()
    await _process_project(db_session, project_job)
    assert project_job.stage == "complete"
    assert project.status == ProjectStatus.REVIEW_REQUIRED.value
    await db_session.refresh(page)

    single_page_job = ProcessingJob(
        project_id=project_id,
        page_id=page.id,
        job_type=JobType.PROCESS_PAGE.value,
    )
    db_session.add(single_page_job)
    await db_session.commit()
    await _process_single_page(db_session, single_page_job)
    await db_session.refresh(project)
    assert project.status == ProjectStatus.REVIEW_REQUIRED.value

    no_match_job = ProcessingJob(
        project_id=project_id,
        job_type=JobType.PROCESS_PROJECT.value,
        result={"page_ids": ["missing-page"]},
    )
    db_session.add(no_match_job)
    await db_session.commit()
    with pytest.raises(AppError) as no_pages:
        await _process_project(db_session, no_match_job)
    assert no_pages.value.code == "no_pages"

    missing_project_job = ProcessingJob(
        project_id="missing-project",
        job_type=JobType.PROCESS_PROJECT.value,
    )
    db_session.add(missing_project_job)
    await db_session.commit()
    with pytest.raises(AppError) as missing_project:
        await _process_project(db_session, missing_project_job)
    assert missing_project.value.code == "project_not_found"

    no_image_page = Page(project_id=project_id, page_number=2)
    db_session.add(no_image_page)
    await db_session.commit()
    await db_session.refresh(no_image_page)
    with pytest.raises(AppError) as process_missing_image:
        await _process_page(db_session, project, no_image_page)
    assert process_missing_image.value.code == "page_missing_original"
    await db_session.refresh(no_image_page)
    assert no_image_page.status == PageStatus.FAILED.value

    with pytest.raises(AppError) as rerender_missing_image:
        await _rerender_page(db_session, project, no_image_page)
    assert rerender_missing_image.value.code == "page_missing_image"

    missing_asset_page = Page(
        project_id=project_id,
        page_number=3,
        original_asset_id="missing-asset",
    )
    db_session.add(missing_asset_page)
    await db_session.commit()
    with pytest.raises(AppError) as process_missing_asset:
        await _process_page_inner(db_session, project, missing_asset_page)
    assert process_missing_asset.value.code == "asset_not_found"
    with pytest.raises(AppError) as rerender_missing_asset:
        await _rerender_page(db_session, project, missing_asset_page)
    assert rerender_missing_asset.value.code == "asset_not_found"

    empty_region = TextRegion(
        page_id=page_id,
        region_index=99,
        bounding_box={"x": 1, "y": 1, "width": 10, "height": 10},
        detected_text=None,
        translated_text=None,
        user_text=None,
    )
    db_session.add(empty_region)
    await db_session.commit()
    await db_session.refresh(empty_region)
    no_text_job = ProcessingJob(
        project_id=project_id,
        page_id=page_id,
        region_id=empty_region.id,
        job_type=JobType.RETRANSLATE_REGION.value,
        result={},
    )
    db_session.add(no_text_job)
    await db_session.commit()
    with pytest.raises(AppError) as no_text:
        await _retranslate_region(db_session, no_text_job)
    assert no_text.value.code == "region_has_no_text"

    missing_page_job = ProcessingJob(
        project_id=project_id,
        page_id="missing-page",
        job_type=JobType.RERENDER_PAGE.value,
    )
    db_session.add(missing_page_job)
    await db_session.commit()
    with pytest.raises(AppError) as missing_page:
        await _rerender_page_for_job(db_session, missing_page_job)
    assert missing_page.value.code == "page_not_found"

    orphan_page = Page(project_id="missing-project", page_number=4)
    db_session.add(orphan_page)
    await db_session.commit()
    await db_session.refresh(orphan_page)
    orphan_page_job = ProcessingJob(
        project_id=project_id,
        page_id=orphan_page.id,
        job_type=JobType.RERENDER_PAGE.value,
    )
    db_session.add(orphan_page_job)
    await db_session.commit()
    with pytest.raises(AppError) as missing_page_project:
        await _rerender_page_for_job(db_session, orphan_page_job)
    assert missing_page_project.value.code == "project_not_found"


@pytest.mark.asyncio
async def test_export_service_direct_success_and_failure_edges(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, project, page, _regions = await _processed_project_fixture(db_session, monkeypatch)

    zip_export = await ExportService(db_session).create_export_job(
        user.id,
        project.id,
        ExportRequest(format=ExportFormat.ZIP, include_originals=True, filename="custom"),
    )
    assert zip_export.status == JobStatus.SUCCEEDED.value
    assert zip_export.asset
    assert zip_export.asset.filename == "custom.zip"

    for export_format, filename, content_type in [
        (ExportFormat.PDF, "book.pdf", "application/pdf"),
        (ExportFormat.IMAGES, "images.zip", "application/zip"),
    ]:
        export = ExportJob(
            user_id=user.id,
            project_id=project.id,
            format=export_format.value,
            settings={
                "format": export_format.value,
                "include_originals": True,
                "page_ids": [page.id],
                "filename": filename,
            },
        )
        db_session.add(export)
        await db_session.commit()
        await db_session.refresh(export)

        await execute_export_job(export.id)
        await db_session.refresh(export)
        asset = await db_session.get(FileAsset, export.asset_id)
        assert export.status == JobStatus.SUCCEEDED.value
        assert asset is not None
        assert asset.content_type == content_type

    with pytest.raises(AppError) as missing_export:
        await ExportService(db_session).get_export(user.id, "missing-export")
    assert missing_export.value.code == "export_not_found"

    missing_project_export = ExportJob(
        user_id=user.id,
        project_id="missing-project",
        format=ExportFormat.ZIP.value,
        settings={"format": "zip"},
    )
    db_session.add(missing_project_export)
    await db_session.commit()
    await db_session.refresh(missing_project_export)

    with pytest.raises(AppError) as missing_project:
        await execute_export_job(missing_project_export.id)
    assert missing_project.value.code == "project_not_found"
    await db_session.refresh(missing_project_export)
    assert missing_project_export.status == JobStatus.FAILED.value

    await execute_export_job("missing-export-id")


@pytest.mark.asyncio
async def test_project_events_streams_project_job_and_export_state(
    db_session: AsyncSession,
) -> None:
    user = await _user(db_session)
    project = Project(
        user_id=user.id,
        name="Events Project",
        target_language="en",
        status=ProjectStatus.PROCESSING.value,
    )
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)

    db_session.add_all(
        [
            ProcessingJob(
                project_id=project.id,
                job_type=JobType.PROCESS_PROJECT.value,
                status=JobStatus.RUNNING.value,
                progress=40,
            ),
            ExportJob(
                user_id=user.id,
                project_id=project.id,
                format="zip",
                status=JobStatus.QUEUED.value,
                progress=0,
            ),
        ]
    )
    await db_session.commit()

    response = await project_events(project.id, current_user=user, session=db_session)
    chunk = await anext(response.body_iterator)
    await response.body_iterator.aclose()

    text = chunk.decode() if isinstance(chunk, bytes) else chunk
    assert "event: project_progress" in text
    assert f'"id": "{project.id}"' in text
    assert '"status": "running"' in text
    assert '"format": "zip"' in text
