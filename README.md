# ImageTranslator

ImageTranslator is a full-stack manga, manhwa, and comic page translation workflow. It lets you upload raw pages, run OCR and translation jobs, review translated text regions, render translated pages, and export the final result.

The current local build is provider-based and uses mock OCR and mock translation by default. That means the full workflow works without external AI keys, but the default processing output is intentionally synthetic until a real provider is enabled or implemented.

## Stack

- Backend: FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, local filesystem storage, Celery eager tasks, Pillow, and provider abstractions for OCR, translation, and rendering.
- Frontend: Vite, React, TypeScript, Tailwind CSS, React Router, TanStack Query, Vitest, and Playwright.
- Local development: Docker Compose starts the frontend, API, database, and a one-shot migration service.

## Run the Project

Prerequisite:

- Docker Desktop or Docker Engine with Docker Compose.

From the repository root:

```bash
docker compose up --build
```

The root compose file starts:

- `frontend`: Vite dev server at `http://localhost:5173`
- `api`: FastAPI server at `http://localhost:8000`
- `postgres`: PostgreSQL at `localhost:5432`
- `migrate`: one-shot Alembic migration runner

Open:

- App: `http://localhost:5173`
- API health: `http://localhost:8000/api/v1/health`
- API docs: `http://localhost:8000/docs`

The frontend is configured to call `http://localhost:8000/api/v1` in Docker. The backend uses the local defaults in `backend/.env.example`, including local file storage, inline job execution, mock OCR, and mock translation providers, so no Redis, MinIO, or AI provider keys are required for local smoke testing.

## OCR and Translation Behavior

Processing is started with `POST /api/v1/projects/{project_id}/process` from the Processing screen or API. The backend creates a `ProcessingJob`, executes it inline by default through Celery eager mode, and updates project/page/job progress while it works.

For each page, the backend:

1. Reads the uploaded original asset.
2. Normalizes the image into PNG.
3. Calls the configured `OCRProvider`.
4. Deletes prior regions for that page.
5. Sends detected OCR text to the configured `TranslationProvider`.
6. Saves one `TextRegion` per OCR region with source text, translated text, bounding box, confidence, and status.
7. Uses the Pillow renderer to clean detected text boxes and render translated text into the page.
8. Stores processed, cleaned, preview, and final assets.

Current provider defaults:

- `OCR_PROVIDER=mock`: creates one synthetic speech region near the top of the page with text `Sample detected text`.
- `OCR_PROVIDER=easyocr`: uses EasyOCR if the backend is installed with the optional OCR dependencies.
- `OCR_PROVIDER=tesseract`: opt-in local prototype OCR path for Korean/Japanese. It uses the native Tesseract binary, `tessdata_fast` language data, light Pillow preprocessing, and line-level boxes from `image_to_data`.
- `TRANSLATION_PROVIDER=mock`: returns text in the format `[target_language] original text`.
- `TRANSLATION_PROVIDER=opus_mt`: opt-in local prototype translation path for pre-converted CTranslate2 OPUS-MT int8 models on disk. It supports Korean/Japanese to English and does not download models during requests.
- `TRANSLATION_PROVIDER=openai` and `TRANSLATION_PROVIDER=deepl`: provider classes exist, but currently raise `NotImplementedError`; they still need API wiring.
- `RENDER_ENGINE=pillow`: fills detected boxes and renders translated text using Pillow.

Low OCR confidence regions are marked `ocr_low_confidence`; otherwise translated regions are marked `translated`. The Review and Editor screens use these saved `TextRegion` records for manual edits, retranslation, and rerendering.

## Local Tesseract + OPUS-MT Prototype

The lightweight local prototype is opt-in and keeps the default mock workflow unchanged. It is designed for CPU-only testing on a 16 GB MacBook where Docker, the backend, frontend, and database may all be running.

Mac setup:

```bash
brew install tesseract tesseract-lang
cd backend
conda run -n imagetranslator python -m pip install -e ".[dev,local-ml]"
```

Use explicit project source languages (`ko`/`kor` or `ja`/`jpn`) when possible. `source_language=auto` lets Tesseract use `kor+jpn`, which is slower than a single language.

Example backend env:

```bash
OCR_PROVIDER=tesseract
TRANSLATION_PROVIDER=opus_mt
TESSERACT_DEFAULT_LANGUAGE=kor
TESSERACT_AUTO_LANGUAGE=kor+jpn
TESSERACT_PSM=6
TESSERACT_OEM=1
OPUS_MT_MODEL_ROOT=/app/models/opus-mt
OPUS_MT_DEFAULT_SOURCE_LANGUAGE=kor
OPUS_MT_COMPUTE_TYPE=int8
OPUS_MT_BEAM_SIZE=1
OPUS_MT_INTRA_THREADS=2
OPUS_MT_INTER_THREADS=1
```

Prepare CTranslate2 OPUS-MT models before starting requests. The runtime expects this layout and will not download model files:

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

Use the setup script to install conversion-only dependencies and prepare those local model folders outside the API process:

```bash
cd backend
./scripts/setup_opus_mt_models.sh
```

The script wraps `ct2-transformers-converter`, writes a local manifest, skips complete model directories unless `OPUS_MT_FORCE=1` is set, and keeps int8 quantization as the default. If you prefer to run the converter manually, use equivalent commands:

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

For Docker, rebuild the backend image after the Dockerfile dependency change and mount `backend/models/opus-mt` into `/app/models/opus-mt` if you keep models outside the bind-mounted backend directory.

## Common Docker Commands

Run in the background:

```bash
docker compose up --build -d
```

Stop services:

```bash
docker compose down
```

Stop services and remove local database and frontend dependency volumes:

```bash
docker compose down -v
```

View logs:

```bash
docker compose logs -f api
docker compose logs -f frontend
```

Run backend migrations manually:

```bash
docker compose exec api alembic upgrade head
```

Run backend tests:

```bash
docker compose exec api pytest -q
```

Run frontend checks:

```bash
docker compose exec frontend npm run lint
docker compose exec frontend npm run typecheck
docker compose exec frontend npm test
```

## Local Backend Only

Use this when you already have PostgreSQL running locally.

```bash
cd backend
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

## Local Frontend Only

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

By default, the frontend uses the in-browser mock adapter. To call the backend instead:

```bash
VITE_API_MODE=http VITE_API_BASE_URL=http://localhost:8000/api/v1 npm run dev
```

The current backend workflow routes use a shared public workspace user, so no login or local storage token is required for local HTTP mode.

## Security

See [SECURITY.md](SECURITY.md) for supported branches, private vulnerability
reporting, response timelines, and provider data-handling notes. Report
vulnerabilities through GitHub private vulnerability reporting instead of public
issues when exploit details, secrets, or private files are involved.

Do not commit provider keys, model tokens, database URLs, production secrets,
or local `.env` values. Use environment variables, ignored local files, or a
deployment secret manager for sensitive configuration.

Do not upload copyrighted, private, confidential, or sensitive manga, comic,
manhwa, or image pages to hosted deployments unless you are authorized to
process that content. The default mock providers run locally, optional
Tesseract and OPUS-MT prototype providers process files on the developer
machine, and future real providers may send content to third-party APIs once
enabled.

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

## Application Flow

1. The app uses a shared public workspace user for local/current workflow routes.
2. The user creates a project with source language, target language, tone, replacement mode, and reading direction.
3. The user uploads page images or a ZIP archive.
4. The backend validates uploads, stores source assets, and creates page records.
5. The user starts project processing.
6. The backend runs OCR, translation, rendering, and progress updates inline through Celery eager tasks.
7. The frontend polls job state or streams project events.
8. The user reviews text regions, edits translations, and rerenders pages or regions.
9. The user exports translated pages as ZIP or PDF.

## Project Structure

```text
backend/
  app/             FastAPI app, models, services, providers, workers, tests
  migrations/      Alembic migrations
  data/storage/    Local development asset storage
frontend/
  src/api/         API adapters and query keys
  src/components/  Shared UI components
  src/data/        Mock seed data
  src/lib/         UI helpers and workflow context
  src/pages/       Routed screens, including dashboard, editor, review, export, assets, team, settings, and workspace tools
  src/types/       Backend-aligned TypeScript contracts
  e2e/             Playwright smoke tests
```

## Notes

- `backend/.env.example` is suitable for local Docker development and uses mock OCR/translation providers by default.
- Tesseract and OPUS-MT are local prototype providers only; enable them explicitly with `OCR_PROVIDER=tesseract` and `TRANSLATION_PROVIDER=opus_mt`.
- Real translation is not currently wired to OpenAI or DeepL; those provider stubs must be implemented before enabling them in environment variables.
- Production deployments should provide real secrets through environment variables or a secret manager.
- A separate worker/queue can be reintroduced later when processing throughput matters.
- Local asset serving through `/api/v1/assets/by-key/{key}` is a development convenience when `STORAGE_BACKEND=local`.
- More detailed backend API, model, and pipeline documentation lives in `backend/README.md`.
- More detailed frontend script and adapter documentation lives in `frontend/README.md`.
