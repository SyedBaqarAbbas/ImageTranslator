# Run Guide

This guide covers two setup paths:

1. Docker Compose (fastest way to run the full app)
2. `start-local-prototype.sh` (local backend/frontend process with configurable env vars)

Run commands from the repo root unless a step says otherwise.

## Option A: Docker Compose Setup

Use this path when you want a quick full-stack run with minimal host setup.

### Prerequisites

1. Install Docker Desktop (or Docker Engine + Docker Compose plugin).
2. Confirm Docker is running:

```bash
docker --version
```

```bash
docker compose version
```

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

### Docker environment variables used

`docker-compose.yml` loads `backend/.env.example` and sets these overrides:

| Service | Variable | Value |
| --- | --- | --- |
| backend (`api`/`migrate`) | `DATABASE_URL` | `postgresql+asyncpg://app:app@postgres:5432/image_translator` |
| backend (`api`/`migrate`) | `CELERY_TASK_ALWAYS_EAGER` | `true` |
| backend (`api`/`migrate`) | `LOCAL_STORAGE_PATH` | `/app/data/storage` |
| backend (`api`/`migrate`) | `PUBLIC_BASE_URL` | `http://localhost:8000` |
| frontend | `VITE_API_MODE` | `http` |
| frontend | `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` |
| frontend | `CHOKIDAR_USEPOLLING` | `true` |
| postgres | `POSTGRES_USER` | `app` |
| postgres | `POSTGRES_PASSWORD` | `app` |
| postgres | `POSTGRES_DB` | `image_translator` |

Provider defaults for this Docker path come from `backend/.env.example`:

- `OCR_PROVIDER=mock`
- `TRANSLATION_PROVIDER=mock`
- `RENDER_ENGINE=pillow`

No provider API keys are required for the default local Docker run.

### Exit mock mode in Docker (run real local models)

Use this when you want real local OCR + translation (`tesseract` + `opus_mt`) instead of mock providers.

1. Prepare OPUS-MT models on host:

```bash
cd backend
./scripts/setup_opus_mt_models.sh
cd ..
```

Note: model preparation uses the `imagetranslator` conda env. If not created yet, run Option B prerequisite step 3 first.

2. Create a Docker override file at repo root named `docker-compose.real-models.yml`:

```yaml
services:
  api:
    environment:
      OCR_PROVIDER: tesseract
      TRANSLATION_PROVIDER: opus_mt
      OPUS_MT_MODEL_ROOT: /app/models/opus-mt
      TESSERACT_DEFAULT_LANGUAGE: kor
      TESSERACT_PSM: "6"
      TESSERACT_OEM: "1"
```

3. Start with the override:

```bash
docker compose -f docker-compose.yml -f docker-compose.real-models.yml up --build
```

4. Verify providers in the running container:

```bash
docker compose exec api python -c "from app.core.config import settings; print('OCR_PROVIDER=', settings.ocr_provider); print('TRANSLATION_PROVIDER=', settings.translation_provider); print('OPUS_MT_MODEL_ROOT=', settings.opus_mt_model_root)"
```

5. Return to mock mode by starting Docker without the override file:

```bash
docker compose up --build
```

## Option B: start-local-prototype.sh Setup

Use this path when you want to run backend + frontend directly on host with a local SQLite database and configurable OCR/translation provider behavior.

### Prerequisites

1. Install Node.js + npm.
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

Exit mock mode and run real models explicitly:

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
