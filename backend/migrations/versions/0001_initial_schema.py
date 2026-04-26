"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-04-26
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "projects",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_language", sa.String(length=16), nullable=False),
        sa.Column("target_language", sa.String(length=16), nullable=False),
        sa.Column("translation_tone", sa.String(length=40), nullable=False),
        sa.Column("replacement_mode", sa.String(length=40), nullable=False),
        sa.Column("reading_direction", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_projects_user_id", "projects", ["user_id"])
    op.create_index("ix_projects_status", "projects", ["status"])
    op.create_index(
        "ix_projects_user_status_updated", "projects", ["user_id", "status", "updated_at"]
    )

    op.create_table(
        "translation_settings",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("project_id", sa.String(length=36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("source_language", sa.String(length=16), nullable=False),
        sa.Column("target_language", sa.String(length=16), nullable=False),
        sa.Column("translation_tone", sa.String(length=40), nullable=False),
        sa.Column("replacement_mode", sa.String(length=40), nullable=False),
        sa.Column("reading_direction", sa.String(length=16), nullable=False),
        sa.Column("preserve_sfx", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("bilingual", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("font_family", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_translation_settings_project_id", "translation_settings", ["project_id"], unique=True
    )

    op.create_table(
        "file_assets",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("project_id", sa.String(length=36), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("page_id", sa.String(length=36), nullable=True),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("storage_backend", sa.String(length=40), nullable=False),
        sa.Column("bucket", sa.String(length=120), nullable=True),
        sa.Column("key", sa.String(length=1024), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_file_assets_user_id", "file_assets", ["user_id"])
    op.create_index("ix_file_assets_project_id", "file_assets", ["project_id"])
    op.create_index("ix_file_assets_page_id", "file_assets", ["page_id"])
    op.create_index("ix_file_assets_kind", "file_assets", ["kind"])
    op.create_index("ix_file_assets_key", "file_assets", ["key"])
    op.create_index("ix_file_assets_project_kind", "file_assets", ["project_id", "kind"])

    op.create_table(
        "pages",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("project_id", sa.String(length=36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("original_asset_id", sa.String(length=36), sa.ForeignKey("file_assets.id"), nullable=True),
        sa.Column("processed_asset_id", sa.String(length=36), sa.ForeignKey("file_assets.id"), nullable=True),
        sa.Column("cleaned_asset_id", sa.String(length=36), sa.ForeignKey("file_assets.id"), nullable=True),
        sa.Column("preview_asset_id", sa.String(length=36), sa.ForeignKey("file_assets.id"), nullable=True),
        sa.Column("final_asset_id", sa.String(length=36), sa.ForeignKey("file_assets.id"), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_pages_project_id", "pages", ["project_id"])
    op.create_index("ix_pages_status", "pages", ["status"])
    op.create_index("ix_pages_project_status", "pages", ["project_id", "status"])
    op.create_index("uq_pages_project_page_number", "pages", ["project_id", "page_number"], unique=True)
    op.create_foreign_key("fk_file_assets_page_id", "file_assets", "pages", ["page_id"], ["id"])

    op.create_table(
        "text_regions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("page_id", sa.String(length=36), sa.ForeignKey("pages.id"), nullable=False),
        sa.Column("region_index", sa.Integer(), nullable=False),
        sa.Column("region_type", sa.String(length=40), nullable=False),
        sa.Column("bounding_box", sa.JSON(), nullable=False),
        sa.Column("polygon", sa.JSON(), nullable=True),
        sa.Column("detected_text", sa.Text(), nullable=True),
        sa.Column("detected_language", sa.String(length=16), nullable=True),
        sa.Column("translated_text", sa.Text(), nullable=True),
        sa.Column("user_text", sa.Text(), nullable=True),
        sa.Column("ocr_confidence", sa.Float(), nullable=True),
        sa.Column("translation_confidence", sa.Float(), nullable=True),
        sa.Column("render_style", sa.JSON(), nullable=True),
        sa.Column("editable", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_text_regions_page_id", "text_regions", ["page_id"])
    op.create_index("ix_text_regions_status", "text_regions", ["status"])
    op.create_index(
        "uq_text_regions_page_region_index", "text_regions", ["page_id", "region_index"], unique=True
    )
    op.create_index("ix_text_regions_page_status", "text_regions", ["page_id", "status"])

    op.create_table(
        "processing_jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("project_id", sa.String(length=36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("page_id", sa.String(length=36), sa.ForeignKey("pages.id"), nullable=True),
        sa.Column("region_id", sa.String(length=36), sa.ForeignKey("text_regions.id"), nullable=True),
        sa.Column("job_type", sa.String(length=60), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=120), nullable=True),
        sa.Column("error_code", sa.String(length=80), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("celery_task_id", sa.String(length=255), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_processing_jobs_project_id", "processing_jobs", ["project_id"])
    op.create_index("ix_processing_jobs_page_id", "processing_jobs", ["page_id"])
    op.create_index("ix_processing_jobs_region_id", "processing_jobs", ["region_id"])
    op.create_index("ix_processing_jobs_job_type", "processing_jobs", ["job_type"])
    op.create_index("ix_processing_jobs_status", "processing_jobs", ["status"])
    op.create_index(
        "ix_processing_jobs_project_status", "processing_jobs", ["project_id", "status"]
    )

    op.create_table(
        "export_jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("project_id", sa.String(length=36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("format", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.String(length=36), sa.ForeignKey("file_assets.id"), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("settings", sa.JSON(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_export_jobs_user_id", "export_jobs", ["user_id"])
    op.create_index("ix_export_jobs_project_id", "export_jobs", ["project_id"])
    op.create_index("ix_export_jobs_status", "export_jobs", ["status"])
    op.create_index("ix_export_jobs_project_status", "export_jobs", ["project_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_export_jobs_project_status", table_name="export_jobs")
    op.drop_index("ix_export_jobs_status", table_name="export_jobs")
    op.drop_index("ix_export_jobs_project_id", table_name="export_jobs")
    op.drop_index("ix_export_jobs_user_id", table_name="export_jobs")
    op.drop_table("export_jobs")

    op.drop_index("ix_processing_jobs_project_status", table_name="processing_jobs")
    op.drop_index("ix_processing_jobs_status", table_name="processing_jobs")
    op.drop_index("ix_processing_jobs_job_type", table_name="processing_jobs")
    op.drop_index("ix_processing_jobs_region_id", table_name="processing_jobs")
    op.drop_index("ix_processing_jobs_page_id", table_name="processing_jobs")
    op.drop_index("ix_processing_jobs_project_id", table_name="processing_jobs")
    op.drop_table("processing_jobs")

    op.drop_index("ix_text_regions_page_status", table_name="text_regions")
    op.drop_index("uq_text_regions_page_region_index", table_name="text_regions")
    op.drop_index("ix_text_regions_status", table_name="text_regions")
    op.drop_index("ix_text_regions_page_id", table_name="text_regions")
    op.drop_table("text_regions")

    op.drop_constraint("fk_file_assets_page_id", "file_assets", type_="foreignkey")
    op.drop_index("uq_pages_project_page_number", table_name="pages")
    op.drop_index("ix_pages_project_status", table_name="pages")
    op.drop_index("ix_pages_status", table_name="pages")
    op.drop_index("ix_pages_project_id", table_name="pages")
    op.drop_table("pages")

    op.drop_index("ix_file_assets_project_kind", table_name="file_assets")
    op.drop_index("ix_file_assets_key", table_name="file_assets")
    op.drop_index("ix_file_assets_kind", table_name="file_assets")
    op.drop_index("ix_file_assets_page_id", table_name="file_assets")
    op.drop_index("ix_file_assets_project_id", table_name="file_assets")
    op.drop_index("ix_file_assets_user_id", table_name="file_assets")
    op.drop_table("file_assets")

    op.drop_index("ix_translation_settings_project_id", table_name="translation_settings")
    op.drop_table("translation_settings")

    op.drop_index("ix_projects_user_status_updated", table_name="projects")
    op.drop_index("ix_projects_status", table_name="projects")
    op.drop_index("ix_projects_user_id", table_name="projects")
    op.drop_table("projects")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

