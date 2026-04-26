from __future__ import annotations

from fastapi import UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import AssetKind, ProjectStatus
from app.core.errors import AppError
from app.models import Page, Project
from app.services.asset_service import AssetService
from app.utils.files import content_type_for_filename
from app.utils.images import ExtractedImage, extract_images_from_zip, validate_image_upload


class UploadService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.assets = AssetService(session)

    async def upload_pages(self, user_id: str, project: Project, uploads: list[UploadFile]) -> list[Page]:
        if not uploads:
            raise AppError("no_files", "At least one file is required.")

        project.status = ProjectStatus.UPLOADING.value
        await self.session.flush()

        extracted: list[ExtractedImage] = []
        for upload in uploads:
            data = await upload.read()
            filename = upload.filename or "upload"
            content_type = upload.content_type or content_type_for_filename(filename)
            if filename.lower().endswith(".zip") or content_type in settings.allowed_archive_types:
                extracted.extend(extract_images_from_zip(data))
                continue
            validate_image_upload(filename, content_type, data)
            extracted.append(ExtractedImage(filename=filename, content_type=content_type, data=data))

        existing_count = await self.session.scalar(
            select(func.count(Page.id)).where(Page.project_id == project.id)
        )
        if int(existing_count or 0) + len(extracted) > settings.max_project_pages:
            raise AppError(
                "too_many_pages",
                f"Project cannot exceed {settings.max_project_pages} pages.",
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        pages: list[Page] = []
        start_number = int(existing_count or 0) + 1
        for offset, image in enumerate(extracted):
            width, height = validate_image_upload(image.filename, image.content_type, image.data)
            asset = await self.assets.create_asset(
                user_id=user_id,
                project_id=project.id,
                page_id=None,
                data=image.data,
                filename=image.filename,
                content_type=image.content_type,
                kind=AssetKind.ORIGINAL,
                key_prefix=f"projects/{project.id}/original",
            )
            page = Page(
                project_id=project.id,
                page_number=start_number + offset,
                original_asset_id=asset.id,
                width=width,
                height=height,
            )
            self.session.add(page)
            await self.session.flush()
            asset.page_id = page.id
            pages.append(page)

        project.status = ProjectStatus.READY.value
        await self.session.commit()
        for page in pages:
            await self.session.refresh(page)
        return pages

