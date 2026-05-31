# Image Translator Backend

FastAPI backend for comic, manga, and manhwa page translation.

The backend is built around provider interfaces for OCR, translation, and rendering. The Docker and local prototype paths default to local Tesseract OCR plus local OPUS-MT translation, so the upload, processing, review, rendering, and export workflow can run without external AI provider keys.

## Quick Start

Use Docker Compose for normal local development. It starts the API and PostgreSQL only. Jobs run inline by default and uploaded/generated assets are stored on the local filesystem.

Prerequisites:

- Docker Desktop or Docker Engine with Compose.
- Conda with the `imagetranslator` Python 3.11 environment for OPUS-MT model
  conversion, unless model folders already exist under `models/opus-mt/`.

From this `backend/` directory:

```bash
cp .env.example .env
./scripts/setup_opus_mt_models.sh
docker compose up --build
```

For a route/API smoke run that does not need real OCR or translation, set
`OCR_PROVIDER=mock` and `TRANSLATION_PROVIDER=mock` before starting Compose.

In a second terminal, apply the database migration:

```bash
docker compose exec api alembic upgrade head
```

Then open:

- API health: `http://localhost:8000/api/v1/health`
- API docs: `http://localhost:8000/docs`

The repository-root Docker Compose workflow reads `backend/.env.example`
directly for fresh-clone setup. The backend-only compose file in this directory
reads `backend/.env`, so run `cp .env.example .env` before using it and keep
local overrides out of version control.

The Docker Compose database image is `postgres:18-alpine`. PostgreSQL 18 stores
data in a version-specific subdirectory under `/var/lib/postgresql`, so local
volumes created for the older `postgres:16-alpine` mount are not migrated in
place. For disposable local data, run `docker compose down -v` before starting
the PostgreSQL 18 stack. Preserve important local data with a dump/restore flow
instead of reusing the old volume directly.

### Environment Variables

`app/core/config.py` defines backend settings and `backend/.env.example`
contains valid local defaults for Docker. The Docker provider settings use
Tesseract OCR and OPUS-MT translation. Local Docker startup does not require
Redis, MinIO, or external provider API keys; processing with the default
translation provider requires prepared OPUS-MT model folders under
`backend/models/opus-mt/`.

List-valued settings accept comma-separated MIME types or JSON arrays. These
forms are equivalent:

```dotenv
ALLOWED_IMAGE_TYPES=image/png,image/jpeg,image/webp
ALLOWED_IMAGE_TYPES=["image/png","image/jpeg","image/webp"]
ALLOWED_ARCHIVE_TYPES=application/zip,application/x-zip-compressed
ALLOWED_ARCHIVE_TYPES=["application/zip","application/x-zip-compressed"]
```

For local Docker, these are the default provider settings:

```dotenv
OCR_PROVIDER=tesseract
TRANSLATION_PROVIDER=opus_mt
RENDER_ENGINE=pillow
OPUS_MT_MODEL_ROOT=/app/models/opus-mt
```

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

View API logs:

```bash
docker compose logs -f api
```

## First API Smoke Test

Create a project:

```bash
curl -X POST http://localhost:8000/api/v1/projects \
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
  -F "files=@/path/to/page.png"
```

Start processing:

```bash
curl -X POST http://localhost:8000/api/v1/projects/<PROJECT_ID>/process \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

Poll the job:

```bash
curl http://localhost:8000/api/v1/jobs/<JOB_ID>
```

The default `.env.example` uses Tesseract OCR and OPUS-MT translation, so processing works locally without external AI provider keys after OPUS-MT models have been prepared. For deterministic provider behavior in tests or quick smoke runs, set `OCR_PROVIDER=mock` and `TRANSLATION_PROVIDER=mock`.

## Running Without Docker

Use this only when you already have PostgreSQL running locally.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
```

Update `.env` so `DATABASE_URL` points to your local database. For quick local experimentation without migrations, set:

```bash
AUTO_CREATE_TABLES=true
```

Run the API:

```bash
uvicorn app.main:app --reload
```

## High-Level Architecture

The backend separates fast request/response operations from slow AI and image work:

- `FastAPI API layer`: public workspace access, optional authentication endpoints, projects, uploads, review edits, job creation, exports, asset access, SSE progress.
- `Service layer`: project ownership checks, upload validation, job orchestration, per-region edits, export creation.
- `Task layer`: Celery tasks for OCR, translation, rendering, retranslation, rerendering, and exports. They run eagerly in the API process by default.
- `Database layer`: PostgreSQL via SQLAlchemy 2 async models and Alembic migrations.
- `Storage layer`: local filesystem by default, with optional S3-compatible storage through `StorageBackend`.
- `Provider layer`: swappable `OCRProvider`, `TranslationProvider`, and `RenderEngine`.
- `Export layer`: ZIP or PDF generation from final rendered page assets.

## Recommended Stack

- `FastAPI`: async-friendly API framework with OpenAPI output.
- `PostgreSQL`: durable metadata, project history, job state, and per-region review data.
- `SQLAlchemy 2 async`: explicit ORM with scalable transaction boundaries.
- `Alembic`: schema migrations.
- `Celery eager mode`: simple inline job execution for the starter app.
- `Local filesystem storage`: original, intermediate, preview, final, and export files.
- `Pillow + OpenCV-ready structure`: MVP rendering now, richer preprocessing/inpainting later.
- Provider abstractions: default local Tesseract/OPUS-MT providers, mock providers for deterministic tests, and an optional EasyOCR starter provider.

## End-to-End Backend Flow

1. The API creates or reuses the shared public workspace user for workflow requests.
2. User creates a project with source language, target language, tone, replacement mode, and reading direction.
3. User uploads images or a ZIP via `POST /projects/{project_id}/pages/upload`.
4. Upload service validates content type, size, image readability, page limits, stores originals, and creates `Page` rows.
5. User updates settings through `PATCH /projects/{project_id}/settings`.
6. User starts processing with `POST /projects/{project_id}/process`.
7. API creates a `ProcessingJob` and executes the Celery task eagerly.
8. The task preprocesses each image, runs OCR, translates text, stores `TextRegion` rows, cleans text areas, renders previews/finals, and updates progress.
9. Frontend polls `GET /jobs/{job_id}` or streams `GET /projects/{project_id}/events`.
10. User reviews regions through `GET /pages/{page_id}/regions` and edits translations via `PATCH /regions/{region_id}`.
11. User rerenders a page or region via `POST /pages/{page_id}/rerender` or `POST /regions/{region_id}/rerender`.
12. User exports with `POST /projects/{project_id}/export`; the task creates ZIP/PDF output and stores it as an export asset.

Project statuses: `draft`, `uploading`, `ready`, `processing`, `ocr_complete`, `translation_complete`, `review_required`, `completed`, `export_ready`, `failed`.

Page statuses: `uploaded`, `queued`, `preprocessing`, `ocr_running`, `ocr_complete`, `translating`, `rendering`, `review_required`, `completed`, `failed`.

Text region statuses: `detected`, `ocr_low_confidence`, `ocr_complete`, `translating`, `translated`, `user_edited`, `rendered`, `needs_review`, `failed`.

## Core Models

- `User`: shared public workspace identity and ownership anchor.
- `Project`: owner, language settings, tone, replacement mode, reading direction, status.
- `TranslationSettings`: mutable provider/rendering preferences for a project.
- `Page`: page number, source/intermediate/rendered asset links, dimensions, status/progress.
- `TextRegion`: bounding box/polygon, OCR text, detected language, translated/user text, confidence, render style, status.
- `FileAsset`: storage backend, bucket/key, content type, size, checksum, dimensions, ownership.
- `ProcessingJob`: job type, status, progress, stage, retry attempts, error diagnostics.
- `ExportJob`: export format, progress, output asset, export settings, failure state.

Important indexes are defined for user/project lists, page ordering, region ordering, job status polling, and asset lookup.

## API Design

Workflow endpoints use the shared public workspace user and do not require an Authorization header.

### Users

- `GET /api/v1/me`: shared public workspace user. Codes: `200`.

### Projects

- `POST /api/v1/projects`: create project. Returns project with settings. Codes: `201`, `422`.
- `GET /api/v1/projects`: list public workspace projects with `limit`, `offset`. Codes: `200`.
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

Processing is triggered by `POST /api/v1/projects/{project_id}/process`. `ProcessingService.create_project_job()` creates a `ProcessingJob`, then `_dispatch_processing_job()` either executes it inline when `CELERY_TASK_ALWAYS_EAGER=true` or sends it to Celery when eager mode is disabled.

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

### Current Provider Behavior

Provider selection is controlled by environment variables in `app/core/config.py`:

- `OCR_PROVIDER=mock` selects the deterministic test provider. `MockOCRProvider` opens the image with Pillow, calculates one bounding box near the top of the page, and returns one `OCRRegion` with text `Sample detected text`, confidence `0.95`, and type `speech`.
- `OCR_PROVIDER=easyocr` uses `EasyOCRProvider`. It imports `easyocr`, builds a CPU reader for the requested source language plus English, runs `reader.readtext()` in a background thread, and maps EasyOCR polygons into `OCRRegion` rows.
- `OCR_PROVIDER=tesseract` is the Docker and local prototype default. It uses `TesseractOCRProvider`, requires the native `tesseract` binary and language data, and applies optional lightweight Pillow preprocessing. Explicit Korean projects first run a lightweight OpenCV comic text-block detector, then call Tesseract on bounded crops and preserve page-coordinate boxes/polygons. If block detection or bounded OCR produces no regions, the provider falls back to its previous full-page `image_to_data` line grouping path.
- `TRANSLATION_PROVIDER=mock` selects the deterministic test provider. `MockTranslationProvider.translate_many()` returns one result per source string using the format `[target_language] source text` with confidence `0.99`.
- `TRANSLATION_PROVIDER=opus_mt` is the Docker and local prototype default. It uses `OpusMTTranslationProvider`, requires pre-converted local CTranslate2 OPUS-MT model directories, and supports Korean/Japanese to English with int8 CPU inference.
- `RENDER_ENGINE=pillow` is the only implemented renderer. It uses Pillow to white-fill detected boxes, wrap translated text, fit font size to each box, and render replacement, overlay, bilingual, side-panel, or subtitle output.

### Local Tesseract OCR Prototype

This path is for fast, low-memory local experimentation and is the default OCR provider for Docker and `start-local-prototype.sh`.

Install Python dependencies with the `local-ml` extra:

```bash
pip install -e ".[dev,local-ml]"
```

Install the native binary and language data separately. On macOS:

```bash
brew install tesseract tesseract-lang
```

Use `tessdata_fast` language data rather than `tessdata_best` for this prototype. Docker installs Debian Tesseract packages in the backend image; rebuild the image after Dockerfile changes:

```bash
docker compose build api
```

Supported language aliases:

- Korean: `ko`, `kr`, `korean`, `kor`
- Japanese: `ja`, `jp`, `japanese`, `jpn`

Explicit project source languages are fastest because Tesseract loads one language. `source_language=auto` uses `TESSERACT_AUTO_LANGUAGE`, which defaults to `kor+jpn` for mixed Korean/Japanese experimentation and is slower.

Speed-oriented defaults:

- `TESSERACT_OEM=1`
- `TESSERACT_PSM=6`
- `TESSERACT_PREPROCESS=true`
- `TESSERACT_KOREAN_TEXT_DETECTION=true`
- `TESSERACT_KOREAN_LINE_PSM=7`
- `TESSERACT_KOREAN_MIN_HANGUL_CHARS=2`
- `TESSERACT_KOREAN_MIN_HANGUL_RATIO=0.5`
- `TESSERACT_KOREAN_MIN_TOKEN_CONFIDENCE=0.5`
- `TESSERACT_UPSCALE_MIN_DIMENSION=0`, so upscaling is disabled unless opted in

Example:

```bash
OCR_PROVIDER=tesseract
TESSERACT_CMD=/opt/homebrew/bin/tesseract
TESSERACT_DATA_PATH=/opt/homebrew/share/tessdata
TESSERACT_DEFAULT_LANGUAGE=kor
TESSERACT_AUTO_LANGUAGE=kor+jpn
TESSERACT_PSM=6
TESSERACT_OEM=1
TESSERACT_KOREAN_TEXT_DETECTION=true
TESSERACT_KOREAN_LINE_PSM=7
TESSERACT_KOREAN_MIN_HANGUL_CHARS=2
TESSERACT_KOREAN_MIN_HANGUL_RATIO=0.5
TESSERACT_KOREAN_MIN_TOKEN_CONFIDENCE=0.5
```

For explicit Korean projects, the bounded detector clusters horizontally
aligned components into sentence rows without recursively joining neighboring
rows. Each crop uses the single-line page-segmentation mode and rejects OCR
results without enough Hangul content or token confidence before processing
falls back to the full-page path.

### Korean Text-Region Detection Benchmark

Run the committed safe synthetic benchmark from `backend/`:

```bash
conda run -n imagetranslator python scripts/benchmark_korean_region_detection.py
```

The generated fixtures cover a missed text block, fragmented lines, a false
positive artwork block, and a merged pair of text blocks. The report separates
detection metrics from OCR metrics and includes recall, false positives, mean
matched IoU, fragmentation errors, merge errors, correctly OCRed detected-region
rate, CER, the manual-vs-automatic CER delta, runtime, and peak RSS evidence.
Synthetic OCR evidence uses a clean-crop oracle so the deterministic run isolates
localization behavior.

For actual Tesseract evidence, keep private or copyrighted manhwa pages outside
the repository and pass a local-only fixture directory:

```bash
conda run -n imagetranslator python scripts/benchmark_korean_region_detection.py \
  --fixture-dir /absolute/path/to/korean-region-fixtures \
  --source-language ko
```

The local mode runs the legacy full-page baseline, Korean text-block detection,
and manually bounded crops against the same annotated pages. It requires the
native Tesseract binary plus Korean language data. See
`tests/manual/README.md` for the manifest format. EasyOCR or PaddleOCR comparisons
must use the same local manifest and be evaluated on detection quality before a
provider change is treated as successful.

### Local OPUS-MT CTranslate2 Prototype

This path is CPU-only and is the default translation provider for Docker and `start-local-prototype.sh`. It does not download models during request processing. The backend expects already-converted int8 CTranslate2 model directories on local disk:

```text
backend/models/opus-mt/
  ko-en/
    model.bin
    config.json
    source.spm
    target.spm
  ja-en/
    model.bin
    config.json
    source.spm
    target.spm
```

The runtime loads `source.spm`, `target.spm`, and the CTranslate2 model lazily on first use, then caches each language-pair bundle. Model files under `backend/models/opus-mt/` are ignored by git except for `.gitkeep`.

Use the setup script to install conversion-only dependencies and prepare local model folders. It wraps `ct2-transformers-converter`, defaults to int8 quantization, skips complete model directories unless force is requested, and writes `backend/models/opus-mt/manifest.json`.

```bash
cd backend
./scripts/setup_opus_mt_models.sh
```

The setup script installs `transformers`, `sacremoses`, and `accelerate` into the existing `imagetranslator` conda env because those are needed to convert Hugging Face OPUS-MT checkpoints. They are not used by backend request handling after the CTranslate2 model directories exist. The generated model files stay under `backend/models/opus-mt/`, which is ignored by git except for `.gitkeep`.

Useful setup variants:

```bash
# Check model files without converting.
conda run -n imagetranslator python scripts/prepare_opus_mt_models.py --check-only

# Print conversion commands without downloading/converting.
conda run -n imagetranslator python scripts/prepare_opus_mt_models.py --dry-run

# Convert only one language pair.
./scripts/setup_opus_mt_models.sh ko-en

# Re-convert existing or partially-written model folders.
OPUS_MT_FORCE=1 ./scripts/setup_opus_mt_models.sh

# Use a different conda env or model directory.
CONDA_ENV_NAME=imagetranslator OPUS_MT_MODEL_ROOT=/path/to/opus-mt ./scripts/setup_opus_mt_models.sh
```

Equivalent manual conversion commands, run outside backend startup:

```bash
ct2-transformers-converter --model Helsinki-NLP/opus-mt-ko-en \
  --output_dir models/opus-mt/ko-en \
  --quantization int8 \
  --copy_files source.spm target.spm \
  --low_cpu_mem_usage
ct2-transformers-converter --model Helsinki-NLP/opus-mt-ja-en \
  --output_dir models/opus-mt/ja-en \
  --quantization int8 \
  --copy_files source.spm target.spm \
  --low_cpu_mem_usage
```

If models live outside the repository, mount them into `/app/models/opus-mt` in Docker or set the explicit model path variables.

Example:

```bash
TRANSLATION_PROVIDER=opus_mt
OPUS_MT_MODEL_ROOT=/app/models/opus-mt
OPUS_MT_COMPUTE_TYPE=int8
OPUS_MT_BEAM_SIZE=1
OPUS_MT_INTRA_THREADS=2
OPUS_MT_INTER_THREADS=1
OPUS_MT_MAX_BATCH_SIZE=4
```

Supported translation aliases:

- Korean source: `ko`, `kor`, `kr`, `korean`
- Japanese source: `ja`, `jpn`, `jp`, `japanese`
- English target: `en`, `eng`, `english`

With `source_language=auto`, the provider uses cheap Unicode script detection. Hangul maps to Korean, Hiragana/Katakana maps to Japanese, and ambiguous CJK-only text falls back to `OPUS_MT_DEFAULT_SOURCE_LANGUAGE`, which defaults to Korean.

### Region Data Model

Each OCR result becomes a `TextRegion` row with:

- `bounding_box` and optional `polygon`
- `detected_text` and `detected_language`
- `translated_text` and optional `user_text`
- `ocr_confidence` and `translation_confidence`
- `render_style`
- `status`

`_process_page()` deletes existing regions for a page before inserting the latest OCR/translation output. Region edits through `PATCH /api/v1/regions/{region_id}` mark the region as `user_edited`. Region retranslation through `POST /api/v1/regions/{region_id}/retranslate` calls the translation provider for a single region, updates the region, and rerenders the page.

### Real Provider Work Still Needed

The EasyOCR path can be enabled once optional OCR dependencies are installed and `OCR_PROVIDER=easyocr` is set. The Tesseract/OPUS-MT path is a lightweight local prototype for Korean/Japanese to English. Additional hosted translation integrations are intentionally out of scope in the current codebase.

## Background Jobs

Job types:

- `process_project`: process all or selected pages.
- `process_page`: rerun OCR/translation/rendering on one page.
- `retranslate_region`: translate one region and rerender its page.
- `rerender_page`: use current region text/style metadata and regenerate page outputs.
- `export_project`: generate ZIP/PDF output.

Celery is configured to run tasks eagerly by default, so no Redis broker or separate worker process is needed for the starter app. Job state is still stored in Postgres so the frontend can poll or stream progress. If processing becomes too slow for request/response flow, switch `CELERY_TASK_ALWAYS_EAGER=false`, configure a real broker, and run a worker process.

## File Storage Strategy

Storage keys use stable project-scoped prefixes:

- `projects/{project_id}/original/`
- `projects/{project_id}/processed/`
- `projects/{project_id}/preview/`
- `projects/{project_id}/final/`
- `projects/{project_id}/export/`

Development uses `STORAGE_BACKEND=local`. Later deployments can use `STORAGE_BACKEND=s3` with S3, R2, GCS S3 compatibility, or MinIO after installing the backend with the `s3` extra. Assets are never trusted by path alone; DB rows enforce ownership for normal API access.

## Security and Deployment Notes

- Current workflow endpoints share one public workspace user; add real auth before exposing multi-user data publicly.
- Every project/page/region/job/export lookup still joins through the workspace user ownership boundary.
- Upload validation checks size, content type, ZIP contents, and image readability.
- Use signed URLs if S3 storage is enabled; local by-key route is a development convenience.
- Keep secrets in environment variables or a secret manager.
- Add rate limiting at API gateway or middleware before public launch.
- Add malware scanning for archives before accepting high-trust enterprise uploads.
- Add a separate worker/queue only when inline processing becomes a bottleneck.
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
- API test public workspace access, project CRUD, upload validation, ownership checks.
- Service test job creation and region edit behavior.
- Task/service test processing with mock OCR/translation/storage and Celery eager mode.
- Export test ZIP/PDF generation from fake rendered page assets.

Future:

- Integration tests against Postgres and any optional storage/queue services you add later.
- Contract tests for each OCR/translation provider.
- Golden-image visual regression tests for rendered previews.
- Load tests for large ZIP uploads and processing throughput.

## MVP Roadmap

Phase 1: Core backend foundation

- Auth, projects, settings, pages, assets, Postgres migrations, local storage, and optional S3 abstraction.
- Image/ZIP upload with validation.
- Mock OCR/translation and Pillow rendering.

Phase 2: Async processing

- Celery eager tasks, progress tracking, retries, project/page/region state transitions.
- Review/edit endpoints.
- Rerender/retranslate jobs.

Phase 3: Export and product polish

- ZIP/PDF export, signed URLs, SSE progress.
- Error diagnostics, structured logs, metrics hooks.
- Frontend-friendly region statuses and low-confidence review flags.

Phase 4: Production integrations

- EasyOCR/PaddleOCR/Google Vision adapters.
- Additional hosted translation adapters.
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
