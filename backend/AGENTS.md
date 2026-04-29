# AGENTS.md

Backend-specific guidance. Also follow the root `AGENTS.md`.

## Stack and Environment

- FastAPI, SQLAlchemy 2 async, Alembic, PostgreSQL/SQLite dev support, Celery eager jobs, Pillow rendering, local/S3-style storage.
- Use the named conda env `imagetranslator` for backend work unless the user asks otherwise.
- The backend targets Python 3.11; do not verify with the base Python 3.13 environment.
- The `imagetranslator` env is expected to include `.[dev,ocr]` and `.[dev,local-ml]` dependencies.

Run from `backend/` if setup is needed:

```bash
conda create -n imagetranslator python=3.11 -y
conda activate imagetranslator
python -m pip install -e ".[dev,ocr]"
python -m pip install -e ".[dev,local-ml]"
```

## Key Backend Paths

- `app/api/routes/` FastAPI route modules.
- `app/db/`, `app/models/`, `migrations/` database setup, models, and Alembic migrations.
- `app/schemas/` Pydantic request/response contracts.
- `app/services/` business logic and job execution.
- `app/providers/` OCR, translation, and rendering providers; see `app/providers/AGENTS.md`.
- `app/tests/` backend tests.

## Workflow Behavior

- Processing entrypoint: `POST /api/v1/projects/{project_id}/process`.
- Route handler: `app/api/routes/processing.py`.
- Main orchestration: `app/services/processing_service.py`.
- `_process_page()` normalizes the image, runs OCR and translation, writes `TextRegion` rows, renders cleaned/final/preview assets, and updates page status.
- Existing regions for a page are deleted before newly detected OCR regions are inserted during page processing.
- `PATCH /api/v1/regions/{region_id}` marks edited regions as `user_edited`.
- Region retranslation calls the configured translation provider for one region and rerenders the page.
- Celery runs eagerly by default through `CELERY_TASK_ALWAYS_EAGER=true`.

## Commands

Run from `backend/`:

```bash
conda run -n imagetranslator pytest -q
conda run -n imagetranslator python -m compileall app migrations
```

For Python changes, run focused tests first, then the full backend tests when touching services, schemas, models, providers, or routes.

Full-project `ruff check app` currently reports a legacy lint backlog. For normal changes, run:

```bash
conda run -n imagetranslator ruff check <changed-python-files>
```

Quick local backend:

```bash
AUTO_CREATE_TABLES=true \
DATABASE_URL=sqlite+aiosqlite:////tmp/image-translator-dev.db \
LOCAL_STORAGE_PATH=/tmp/image-translator-storage \
PUBLIC_BASE_URL=http://localhost:8000 \
conda run -n imagetranslator python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Backend startup can fail in sandboxed mode when binding to port `8000`; rerun with approval if needed.
