# Docker

The root Docker Compose workflow starts the full app with Docker-managed services.

## Prerequisites

- Docker Desktop or Docker Engine with the Compose plugin
- OPUS-MT model folders prepared before using the default `opus_mt` provider

Check Docker:

```bash
docker --version
docker compose version
```

Prepare OPUS-MT models:

```bash
cd backend
./scripts/setup_opus_mt_models.sh
cd ..
```

## Start

From the repository root:

```bash
docker compose up --build
```

Open:

- Frontend: `http://localhost:5173`
- API health: `http://localhost:8000/api/v1/health`
- API docs: `http://localhost:8000/docs`

## Stop

```bash
docker compose down
```

Remove disposable local volumes:

```bash
docker compose down -v
```

## Docker Defaults

The root `docker-compose.yml` uses PostgreSQL and points the frontend at the backend API.

| Service | Variable | Default |
| --- | --- | --- |
| API and migrate | `DATABASE_URL` | `postgresql+asyncpg://app:app@postgres:5432/image_translator` |
| API and migrate | `CELERY_TASK_ALWAYS_EAGER` | `true` |
| API and migrate | `LOCAL_STORAGE_PATH` | `/app/data/storage` |
| API and migrate | `PUBLIC_BASE_URL` | `http://localhost:8000` |
| API and migrate | `OCR_PROVIDER` | `tesseract` |
| API and migrate | `TRANSLATION_PROVIDER` | `opus_mt` |
| API and migrate | `OPUS_MT_MODEL_ROOT` | `/app/models/opus-mt` |
| API and migrate | `RENDER_ENGINE` | `pillow` |
| Frontend | `VITE_API_MODE` | `http` |
| Frontend | `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` |
| Postgres | image | `postgres:18-alpine` |

No external provider API keys are required for the default Docker run.

## Mock Docker Mode

Use mock mode for deterministic local demos or tests that should not require Tesseract or OPUS-MT:

```bash
OCR_PROVIDER=mock TRANSLATION_PROVIDER=mock docker compose up --build
```

Return to default real local providers by starting Compose without those shell overrides:

```bash
docker compose up --build
```

## PostgreSQL 18 Volume Note

The Compose database image is `postgres:18-alpine`. PostgreSQL 18 stores data in a version-specific subdirectory under `/var/lib/postgresql`. If you previously used an older local Compose volume and the data is disposable, run:

```bash
docker compose down -v
```

Use dump/restore for local data you need to keep. The local Compose workflow does not perform an in-place major-version database upgrade.
