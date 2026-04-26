# Image Translator Backend

FastAPI backend for AI-powered comic, manga, and manhwa page translation.

## Quick Start

Use Docker Compose for normal local development. It starts the API, Celery worker, PostgreSQL, Redis, and MinIO.

Prerequisites:

- Docker Desktop or Docker Engine with Compose.
- Python 3.11 only if you want to run commands outside Docker.

From this `backend/` directory:

```bash
cp .env.example .env
docker compose up --build
```

In a second terminal, apply the database migration:

```bash
docker compose exec api alembic upgrade head
```

Then open:

- API health: `http://localhost:8000/api/v1/health`
- API docs: `http://localhost:8000/docs`
- MinIO console: `http://localhost:9001`

Default local MinIO credentials are `minioadmin` / `minioadmin`.

## Common Commands

Start the full local stack:

```bash
docker compose up --build
```

Run only in the background:

```bash
docker compose up --build -d
```

Stop local services:

```bash
docker compose down
```

Run migrations:

```bash
docker compose exec api alembic upgrade head
```

Run tests:

```bash
docker compose exec api pytest -q
```

Run syntax/import checks:

```bash
docker compose exec api python -m compileall app migrations
```

View worker logs:

```bash
docker compose logs -f worker
```

## First API Smoke Test

Register a user:

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"password123","display_name":"Demo"}'
```

Copy the returned `access_token`, then create a project:

```bash
curl -X POST http://localhost:8000/api/v1/projects \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo Manga",
    "source_language": "auto",
    "target_language": "en",
    "translation_tone": "natural",
    "replacement_mode": "replace",
    "reading_direction": "rtl"
  }'
```

Upload pages:

```bash
curl -X POST http://localhost:8000/api/v1/projects/<PROJECT_ID>/pages/upload \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "files=@/path/to/page.png"
```

Start processing:

```bash
curl -X POST http://localhost:8000/api/v1/projects/<PROJECT_ID>/process \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

Poll the job:

```bash
curl http://localhost:8000/api/v1/jobs/<JOB_ID> \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

The default `.env.example` uses mock OCR and mock translation, so processing works locally without external AI provider keys.

## Running Without Docker

Use this only when you already have PostgreSQL and Redis running locally.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
```

Update `.env` so `DATABASE_URL`, `REDIS_URL`, `CELERY_BROKER_URL`, and `CELERY_RESULT_BACKEND` point to your local services. For quick local experimentation without migrations, set:

```bash
AUTO_CREATE_TABLES=true
```

Run the API:

```bash
uvicorn app.main:app --reload
```

Run the worker in another terminal:

```bash
celery -A app.workers.celery_app.celery_app worker --loglevel=INFO
```

## High-Level Architecture

The backend separates fast request/response operations from slow AI and image work:

- `FastAPI API layer`: authentication, projects, uploads, review edits, job creation, exports, asset access, SSE progress.
- `Service layer`: project ownership checks, upload validation, job orchestration, per-region edits, export creation.
- `Worker layer`: Celery tasks for OCR, translation, rendering, retranslation, rerendering, and exports.
- `Database layer`: PostgreSQL via SQLAlchemy 2 async models and Alembic migrations.
- `Storage layer`: pluggable local filesystem or S3/MinIO using `StorageBackend`.
- `Provider layer`: swappable `OCRProvider`, `TranslationProvider`, and `RenderEngine`.
- `Export layer`: ZIP or PDF generation from final rendered page assets.

## Recommended Stack

- `FastAPI`: async-friendly API framework with OpenAPI output.
- `PostgreSQL`: durable metadata, project history, job state, and per-region review data.
- `SQLAlchemy 2 async`: explicit ORM with scalable transaction boundaries.
- `Alembic`: schema migrations.
- `Redis + Celery`: production-capable background jobs with retry/backoff.
- `S3-compatible storage / MinIO`: original, intermediate, preview, final, and export files.
- `Pillow + OpenCV-ready structure`: MVP rendering now, richer preprocessing/inpainting later.
- Provider abstractions: mock providers for local dev, EasyOCR starter, placeholders for OpenAI/DeepL/Google Vision.

## End-to-End Backend Flow

1. User registers/logs in and receives a JWT.
2. User creates a project with source language, target language, tone, replacement mode, and reading direction.
3. User uploads images or a ZIP via `POST /projects/{project_id}/pages/upload`.
4. Upload service validates content type, size, image readability, page limits, stores originals, and creates `Page` rows.
5. User updates settings through `PATCH /projects/{project_id}/settings`.
6. User starts processing with `POST /projects/{project_id}/process`.
7. API creates a `ProcessingJob` and enqueues Celery work.
8. Worker preprocesses each image, runs OCR, translates text, stores `TextRegion` rows, cleans text areas, renders previews/finals, and updates progress.
9. Frontend polls `GET /jobs/{job_id}` or streams `GET /projects/{project_id}/events`.
10. User reviews regions through `GET /pages/{page_id}/regions` and edits translations via `PATCH /regions/{region_id}`.
11. User rerenders a page or region via `POST /pages/{page_id}/rerender` or `POST /regions/{region_id}/rerender`.
12. User exports with `POST /projects/{project_id}/export`; worker creates ZIP/PDF and stores it as an export asset.

Project statuses: `draft`, `uploading`, `ready`, `processing`, `ocr_complete`, `translation_complete`, `review_required`, `completed`, `export_ready`, `failed`.

Page statuses: `uploaded`, `queued`, `preprocessing`, `ocr_running`, `ocr_complete`, `translating`, `rendering`, `review_required`, `completed`, `failed`.

Text region statuses: `detected`, `ocr_low_confidence`, `ocr_complete`, `translating`, `translated`, `user_edited`, `rendered`, `needs_review`, `failed`.

## Core Models

- `User`: account identity, password hash, active/admin flags.
- `Project`: owner, language settings, tone, replacement mode, reading direction, status.
- `TranslationSettings`: mutable provider/rendering preferences for a project.
- `Page`: page number, source/intermediate/rendered asset links, dimensions, status/progress.
- `TextRegion`: bounding box/polygon, OCR text, detected language, translated/user text, confidence, render style, status.
- `FileAsset`: storage backend, bucket/key, content type, size, checksum, dimensions, ownership.
- `ProcessingJob`: job type, status, progress, stage, retry attempts, error diagnostics.
- `ExportJob`: export format, progress, output asset, export settings, failure state.

Important indexes are defined for user/project lists, page ordering, region ordering, job status polling, and asset lookup.

## API Design

All endpoints except health and local dev file serving require `Authorization: Bearer <token>`.

### Auth / Users

- `POST /api/v1/auth/register`: create user. Body: `email`, `password`, `display_name`. Returns JWT and user. Codes: `201`, `409`, `422`.
- `POST /api/v1/auth/login`: login with email/password. Returns JWT and user. Codes: `200`, `401`, `422`.
- `GET /api/v1/me`: current user. Codes: `200`, `401`.

### Projects

- `POST /api/v1/projects`: create project. Returns project with settings. Codes: `201`, `401`, `422`.
- `GET /api/v1/projects`: list user projects with `limit`, `offset`. Codes: `200`, `401`.
- `GET /api/v1/projects/{project_id}`: project detail. Codes: `200`, `404`.
- `PATCH /api/v1/projects/{project_id}`: update metadata/settings mirrored on project. Codes: `200`, `404`, `422`.
- `DELETE /api/v1/projects/{project_id}`: soft delete. Codes: `204`, `404`.
- `PATCH /api/v1/projects/{project_id}/settings`: update translation/rendering preferences. Codes: `200`, `404`, `422`.

### Uploads / Pages

- `POST /api/v1/projects/{project_id}/pages/upload`: multipart `files[]`; supports images and ZIP. Returns pages. Codes: `201`, `400`, `413`, `422`.
- `GET /api/v1/projects/{project_id}/pages`: list pages. Codes: `200`, `404`.
- `GET /api/v1/pages/{page_id}`: page detail with key assets. Codes: `200`, `404`.
- `POST /api/v1/pages/{page_id}/reprocess`: enqueue OCR/translation/render. Codes: `202`, `404`.
- `POST /api/v1/pages/{page_id}/rerender`: enqueue rendering only. Codes: `202`, `404`.

### Processing

- `POST /api/v1/projects/{project_id}/process`: enqueue project processing. Body: optional `page_ids`, `force`. Codes: `202`, `404`, `409`.
- `GET /api/v1/projects/{project_id}/jobs`: list processing jobs. Codes: `200`, `404`.
- `GET /api/v1/jobs/{job_id}`: job status/progress/errors. Codes: `200`, `404`.
- `GET /api/v1/projects/{project_id}/events`: Server-Sent Events for project/job/export progress.

### Text Regions

- `GET /api/v1/pages/{page_id}/regions`: list OCR/translation regions. Codes: `200`, `404`.
- `PATCH /api/v1/regions/{region_id}`: edit text, bbox, type, style. Codes: `200`, `404`, `422`.
- `POST /api/v1/regions/{region_id}/retranslate`: enqueue provider retranslation. Codes: `202`, `404`.
- `POST /api/v1/regions/{region_id}/rerender`: enqueue affected page rerender. Codes: `202`, `404`.

### Exports / Assets

- `POST /api/v1/projects/{project_id}/export`: enqueue `zip`, `pdf`, or image ZIP export. Codes: `202`, `404`.
- `GET /api/v1/exports/{export_id}`: export status. Codes: `200`, `404`.
- `GET /api/v1/exports/{export_id}/download`: signed/download URL. Codes: `200`, `409`, `404`.
- `GET /api/v1/assets/{asset_id}`: asset metadata. Codes: `200`, `404`.
- `GET /api/v1/assets/{asset_id}/download`: signed/download URL. Codes: `200`, `404`.

## OCR / Translation / Rendering Pipeline

Pipeline stages:

1. Ingest: validate image/ZIP upload, store original.
2. Preprocess: normalize EXIF orientation and convert to PNG; later add denoise/contrast/resize via OpenCV.
3. Detect/OCR: `OCRProvider.detect_and_read()` returns bounding boxes, polygons, text, language, confidence, region type.
4. Translate: `TranslationProvider.translate_many()` translates batched text with language/tone/context.
5. Persist: save one `TextRegion` per OCR region with confidence and status.
6. Clean: `RenderEngine.clean_page()` removes source text from region boxes. MVP uses white bubble fill; future uses inpainting.
7. Render: auto-wraps translated text, adapts font size, centers inside region, supports replace/overlay/bilingual/side-panel/subtitle modes.
8. Preview/final: store cleaned, preview, and final images as `FileAsset`.
9. Export: assemble final assets into ZIP or PDF.

Low OCR confidence regions become `ocr_low_confidence` and should be highlighted by the frontend for manual review.

## Background Jobs

Job types:

- `process_project`: process all or selected pages.
- `process_page`: rerun OCR/translation/rendering on one page.
- `retranslate_region`: translate one region and rerender its page.
- `rerender_page`: use current region text/style metadata and regenerate page outputs.
- `export_project`: generate ZIP/PDF output.

Celery is configured with Redis broker/result backend, late acknowledgements, retry backoff, and separate `processing` / `exports` queues. Job state is stored in Postgres so the frontend can poll independently of Celery result backend retention.

## File Storage Strategy

Storage keys use stable project-scoped prefixes:

- `projects/{project_id}/original/`
- `projects/{project_id}/processed/`
- `projects/{project_id}/preview/`
- `projects/{project_id}/final/`
- `projects/{project_id}/export/`

Development can use `STORAGE_BACKEND=local`. Production should use `STORAGE_BACKEND=s3` with S3, R2, GCS S3 compatibility, or MinIO. Assets are never trusted by path alone; DB rows enforce ownership for normal API access.

## Security and Deployment Notes

- JWT auth protects user data.
- Every project/page/region/job/export lookup joins through project ownership.
- Upload validation checks size, content type, ZIP contents, and image readability.
- Use signed URLs for S3 downloads; local by-key route is a development convenience.
- Keep secrets in environment variables or a secret manager.
- Add rate limiting at API gateway or middleware before public launch.
- Add malware scanning for archives before accepting high-trust enterprise uploads.
- Run API and worker as separate deployable processes.
- Use structured logs for request completion, job starts, provider calls, and failures.
- Add OpenTelemetry tracing and Prometheus metrics for provider latency, job duration, failures, and queue depth.

Example structured events:

```json
{"event":"request_completed","method":"POST","path":"/api/v1/projects","status_code":201,"duration_ms":34.2}
{"event":"processing job started","job_id":"...","task_id":"..."}
{"event":"ocr_failed","provider":"easyocr","page_id":"...","error":"..."}
{"event":"export_failed","export_id":"...","format":"pdf","error":"..."}
```

## Testing Strategy

MVP first:

- Unit test upload validation, ZIP extraction, rendering layout, provider interfaces.
- API test auth, project CRUD, upload validation, ownership checks.
- Service test job creation and region edit behavior.
- Worker test processing with mock OCR/translation/storage and Celery eager mode.
- Export test ZIP/PDF generation from fake rendered page assets.

Future:

- Integration tests against Postgres/Redis/MinIO.
- Contract tests for each OCR/translation provider.
- Golden-image visual regression tests for rendered previews.
- Load tests for large ZIP uploads and worker throughput.

## MVP Roadmap

Phase 1: Core backend foundation

- Auth, projects, settings, pages, assets, Postgres migrations, local/S3 storage abstraction.
- Image/ZIP upload with validation.
- Mock OCR/translation and Pillow rendering.

Phase 2: Async processing

- Celery workers, progress tracking, retries, project/page/region state transitions.
- Review/edit endpoints.
- Rerender/retranslate jobs.

Phase 3: Export and product polish

- ZIP/PDF export, signed URLs, SSE progress.
- Error diagnostics, structured logs, metrics hooks.
- Frontend-friendly region statuses and low-confidence review flags.

Phase 4: Production integrations

- EasyOCR/PaddleOCR/Google Vision adapters.
- OpenAI/DeepL/Google Translate adapters.
- OpenCV preprocessing and inpainting for better artwork preservation.
- Rate limits, quotas, billing, collaboration, version history, audit logs, and human review workflows.

## Suggested Folder Structure

```text
app/
  api/
    routes/
  core/
  db/
  models/
  schemas/
  services/
  providers/
  storage/
  workers/
  utils/
  tests/
migrations/
data/storage/
```
