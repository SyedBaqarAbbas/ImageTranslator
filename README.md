# ImageTranslator

ImageTranslator is a full-stack manga, manhwa, and comic page translation workflow. It lets you upload raw pages, run OCR and translation jobs, review translated text regions, render translated pages, and export the final result.

## Stack

- Backend: FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, Redis, Celery, MinIO/S3-compatible storage, Pillow, and provider abstractions for OCR, translation, and rendering.
- Frontend: Vite, React, TypeScript, Tailwind CSS, React Router, TanStack Query, Vitest, and Playwright.
- Local development: Docker Compose starts the frontend, API, worker, database, Redis, MinIO, and a one-shot migration service.

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
- `worker`: Celery background worker
- `postgres`: PostgreSQL at `localhost:5432`
- `redis`: Redis at `localhost:6379`
- `minio`: MinIO API at `localhost:9000` and console at `http://localhost:9001`
- `migrate`: one-shot Alembic migration runner

Open:

- App: `http://localhost:5173`
- API health: `http://localhost:8000/api/v1/health`
- API docs: `http://localhost:8000/docs`
- MinIO console: `http://localhost:9001`

Default local MinIO credentials are `minioadmin` / `minioadmin`.

The frontend is configured to call `http://localhost:8000/api/v1` in Docker. The backend uses the local defaults in `backend/.env.example`, including mock OCR and mock translation providers, so no external AI provider keys are required for local smoke testing.

## Common Docker Commands

Run in the background:

```bash
docker compose up --build -d
```

Stop services:

```bash
docker compose down
```

Stop services and remove local database, MinIO, and frontend dependency volumes:

```bash
docker compose down -v
```

View logs:

```bash
docker compose logs -f api
docker compose logs -f worker
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

Use this when you already have PostgreSQL and Redis running locally.

```bash
cd backend
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

If auth is enabled and you are using the HTTP adapter directly, place the bearer token in local storage under `comicflow.accessToken`, or override the key with `VITE_AUTH_TOKEN_KEY`.

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

## Application Flow

1. A user registers or logs in and receives a JWT.
2. The user creates a project with source language, target language, tone, replacement mode, and reading direction.
3. The user uploads page images or a ZIP archive.
4. The backend validates uploads, stores source assets, and creates page records.
5. The user starts project processing.
6. Celery runs OCR, translation, rendering, and progress updates in the background.
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
  src/pages/       Routed screens
  src/types/       Backend-aligned TypeScript contracts
  e2e/             Playwright smoke tests
```

## Notes

- `backend/.env.example` is suitable for local Docker development and uses mock OCR/translation providers by default.
- Production deployments should provide real secrets through environment variables or a secret manager.
- The API and worker are separate processes and should remain separate in deployment.
- Local asset serving through `/api/v1/assets/by-key/{key}` is a development convenience when `STORAGE_BACKEND=local`.
- More detailed backend API, model, and pipeline documentation lives in `backend/README.md`.
- More detailed frontend script and adapter documentation lives in `frontend/README.md`.
