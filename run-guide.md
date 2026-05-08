# Run Guide

This guide covers two setup paths:

1. Docker Compose (full app with Docker-managed services)
2. `start-local-prototype.sh` (local backend/frontend process with configurable env vars)

Run commands from the repo root unless a step says otherwise.

## Option A: Docker Compose Setup

Use this path when you want a full-stack run with Docker-managed services and local real OCR/translation providers by default.

### Prerequisites

1. Install Docker Desktop (or Docker Engine + Docker Compose plugin).
2. Confirm Docker is running:

```bash
docker --version
```

```bash
docker compose version
```

3. Prepare OPUS-MT model folders once before processing pages with the default `opus_mt` provider:

```bash
cd backend
./scripts/setup_opus_mt_models.sh
cd ..
```

The model setup script uses the `imagetranslator` conda environment for conversion. If the env does not exist yet, create it with Option B prerequisite step 3 first. You can start Docker before models are prepared, but processing/retranslation with the default provider will fail until `backend/models/opus-mt/ko-en` and `backend/models/opus-mt/ja-en` exist.

### Step-by-step

1. Start services:

```bash
docker compose up --build
```

2. Open the app and API:
   - Frontend: `http://localhost:5173`
   - API health: `http://localhost:8000/api/v1/health`
   - API docs: `http://localhost:8000/docs`

3. Stop services:

```bash
docker compose down
```

4. Optional cleanup (remove DB and frontend dependency volumes):

```bash
docker compose down -v
```

The Docker Compose database image is `postgres:18-alpine`. If you previously
ran the app with a PostgreSQL 16 compose volume, use `docker compose down -v`
for disposable local data before starting PostgreSQL 18. Use dump/restore for
anything you need to keep; the local Compose workflow does not run an in-place
major-version database upgrade.

### Docker environment variables used

`docker-compose.yml` loads `backend/.env.example` and sets these overrides:

| Service | Variable | Value |
| --- | --- | --- |
| backend (`api`/`migrate`) | `DATABASE_URL` | `postgresql+asyncpg://app:app@postgres:5432/image_translator` |
| backend (`api`/`migrate`) | `CELERY_TASK_ALWAYS_EAGER` | `true` |
| backend (`api`/`migrate`) | `LOCAL_STORAGE_PATH` | `/app/data/storage` |
| backend (`api`/`migrate`) | `PUBLIC_BASE_URL` | `http://localhost:8000` |
| backend (`api`/`migrate`) | `OCR_PROVIDER` | `tesseract` |
| backend (`api`/`migrate`) | `TRANSLATION_PROVIDER` | `opus_mt` |
| backend (`api`/`migrate`) | `OPUS_MT_MODEL_ROOT` | `/app/models/opus-mt` |
| backend (`api`/`migrate`) | `RENDER_ENGINE` | `pillow` |
| frontend | `VITE_API_MODE` | `http` |
| frontend | `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` |
| frontend | `CHOKIDAR_USEPOLLING` | `true` |
| postgres | image | `postgres:18-alpine` |
| postgres | `POSTGRES_USER` | `app` |
| postgres | `POSTGRES_PASSWORD` | `app` |
| postgres | `POSTGRES_DB` | `image_translator` |

Provider defaults for this Docker path are set in `docker-compose.yml`; the provider names match `backend/.env.example` and Compose sets the container model path:

- `OCR_PROVIDER=tesseract`
- `TRANSLATION_PROVIDER=opus_mt`
- `OPUS_MT_MODEL_ROOT=/app/models/opus-mt`
- `RENDER_ENGINE=pillow`

No provider API keys are required for the default local Docker run.

### Run Docker in mock mode

Use this when you want deterministic mock OCR + mock translation instead of local real providers:

```bash
OCR_PROVIDER=mock TRANSLATION_PROVIDER=mock docker compose up --build
```

Verify providers in the running container:

```bash
docker compose exec api python -c "from app.core.config import settings; print('OCR_PROVIDER=', settings.ocr_provider); print('TRANSLATION_PROVIDER=', settings.translation_provider); print('OPUS_MT_MODEL_ROOT=', settings.opus_mt_model_root)"
```

Return to the default real local providers by starting Docker without those shell overrides:

```bash
docker compose up --build
```

## Option B: start-local-prototype.sh Setup

Use this path when you want to run backend + frontend directly on host with a local SQLite database and configurable OCR/translation provider behavior.

### Prerequisites

1. Install Node.js 24 LTS + npm.
2. Install Conda (Anaconda or Miniconda).
3. Create backend env and install dependencies:

```bash
cd backend
conda create -n imagetranslator python=3.11 -y
conda run -n imagetranslator python -m pip install -e ".[dev,ocr]"
conda run -n imagetranslator python -m pip install -e ".[dev,local-ml]"
cd ..
```

4. Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

5. If using default providers (`tesseract` + `opus_mt`), install Tesseract (macOS):

```bash
brew install tesseract tesseract-lang
```

6. If using default translation provider (`opus_mt`), prepare models once:

```bash
cd backend
./scripts/setup_opus_mt_models.sh
cd ..
```

### Step-by-step

1. Start both servers:

```bash
./start-local-prototype.sh
```

2. Open:
   - Frontend: `http://127.0.0.1:5173`
   - Backend health: `http://127.0.0.1:8000/api/v1/health`

3. Stop both with `Ctrl-C`.

### Script environment variables and defaults

`start-local-prototype.sh` reads these env vars:

| Variable | Default |
| --- | --- |
| `CONDA_ENV_NAME` | `imagetranslator` |
| `BACKEND_HOST` | `127.0.0.1` |
| `BACKEND_PORT` | `8000` |
| `FRONTEND_HOST` | `127.0.0.1` |
| `FRONTEND_PORT` | `5173` |
| `AUTO_CREATE_TABLES` | `true` |
| `LOCAL_PROTOTYPE_DATA_DIR` | `<repo>/.local-data` |
| `DATABASE_URL` | `sqlite+aiosqlite:///<repo>/.local-data/image-translator-local-prototype.db` |
| `LOCAL_STORAGE_PATH` | `<repo>/.local-data/storage` |
| `PUBLIC_BASE_URL` | `http://$BACKEND_HOST:$BACKEND_PORT` |
| `OCR_PROVIDER` | `tesseract` |
| `TRANSLATION_PROVIDER` | `opus_mt` |
| `TESSERACT_DEFAULT_LANGUAGE` | `kor` |
| `TESSERACT_PSM` | `6` |
| `TESSERACT_OEM` | `1` |
| `OPUS_MT_MODEL_ROOT` | `<repo>/backend/models/opus-mt` |
| `VITE_API_MODE` | `http` |
| `VITE_API_BASE_URL` | `http://$BACKEND_HOST:$BACKEND_PORT/api/v1` |

### Useful start-local-prototype overrides

Run in mock mode (no Tesseract/OPUS-MT requirement):

```bash
OCR_PROVIDER=mock TRANSLATION_PROVIDER=mock ./start-local-prototype.sh
```

Run real models explicitly (same providers as the defaults):

```bash
OCR_PROVIDER=tesseract TRANSLATION_PROVIDER=opus_mt OPUS_MT_MODEL_ROOT="$(pwd)/backend/models/opus-mt" ./start-local-prototype.sh
```

Optional language controls for real models:

```bash
TESSERACT_DEFAULT_LANGUAGE=kor TESSERACT_AUTO_LANGUAGE=kor+jpn OPUS_MT_DEFAULT_SOURCE_LANGUAGE=kor ./start-local-prototype.sh
```

Use custom ports:

```bash
BACKEND_PORT=8010 FRONTEND_PORT=5174 ./start-local-prototype.sh
```

Use a custom data directory:

```bash
LOCAL_PROTOTYPE_DATA_DIR=/tmp/image-translator-local ./start-local-prototype.sh
```

## Optional Validation Commands

Backend tests:

```bash
cd backend
conda run -n imagetranslator pytest -q --cov=app --cov-report=term-missing:skip-covered
```

Frontend checks:

```bash
cd frontend
npm run typecheck
npm run lint
npm run test:coverage
```

Full release gate:

```bash
./up-and-test.sh
```
