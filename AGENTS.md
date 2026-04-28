# AGENTS.md

Guidance for Codex and other coding agents working in this repository.

## Project Summary

ImageTranslator is a full-stack manga/comic translation workflow.

- Backend: FastAPI, SQLAlchemy 2 async, Alembic, PostgreSQL/SQLite dev support, Celery eager jobs, Pillow rendering, local/S3-style asset storage, provider interfaces for OCR and translation.
- Frontend: Vite, React, TypeScript, Tailwind CSS, React Router, TanStack Query, Vitest, and Playwright.
- Local workflow: upload pages, configure project settings, run processing, review/edit detected regions, render translated pages, and export ZIP/PDF/images.

## Important Current Behavior

- The default backend uses mock OCR and mock translation.
- Mock OCR creates one synthetic text region near the top of each image with `Sample detected text`.
- Mock translation returns `[target_language] source text`.
- `OCR_PROVIDER=easyocr` exists but requires optional OCR dependencies.
- The named conda env `imagetranslator` has been set up with `.[dev,ocr]`, including EasyOCR, Torch, torchvision, PaddleOCR, and related OCR dependencies.
- EasyOCR creates/downloads model files under `~/.EasyOCR` on first actual OCR use. A real smoke test has successfully read `HELLO 123` from a generated image with `OCR_PROVIDER=easyocr`.
- `TRANSLATION_PROVIDER=openai` and `TRANSLATION_PROVIDER=deepl` currently select provider stubs that raise `NotImplementedError`; do not claim real OpenAI/DeepL translation works until those providers are implemented.
- `RENDER_ENGINE=pillow` is the implemented renderer.
- Workflow API routes use a shared public workspace user; no frontend auth token is required in local HTTP mode.

## Repo Layout

```text
backend/
  app/
    api/routes/       FastAPI route modules
    core/             config, enums, errors, security, logging
    db/               async session/base setup
    models/           SQLAlchemy models
    providers/        OCR, translation, rendering providers
    schemas/          Pydantic request/response models
    services/         business logic and job execution
    storage/          local/S3 storage backends
    workers/          Celery task wrappers
    tests/            backend tests
  migrations/         Alembic migrations
frontend/
  src/api/            mock/http adapters and query keys
  src/components/     shared UI components
  src/data/           mock seed data
  src/lib/            routing/assets/upload helpers
  src/pages/          routed screens
  src/types/          API-aligned TypeScript types
testing/              manual/browser test evidence; ignored by git
```

## Development Commands

Preferred Python environment:

```bash
conda create -n imagetranslator python=3.11 -y
conda activate imagetranslator
cd backend
python -m pip install -e ".[dev,ocr]"
```

Use this named conda environment for backend work unless the user asks otherwise. The backend targets Python 3.11; do not use the base Python 3.13 environment for verification.

Root Docker workflow:

```bash
docker compose up --build
docker compose down
docker compose logs -f api
docker compose logs -f frontend
```

Backend:

```bash
cd backend
conda run -n imagetranslator pytest -q
conda run -n imagetranslator python -m compileall app migrations
```

Full-project `ruff check app` currently reports a legacy lint backlog unrelated to the conda/OCR setup. For normal changes, run `conda run -n imagetranslator ruff check <changed-python-files>` unless the task is specifically to clean up lint.

Frontend:

```bash
cd frontend
npm run typecheck
npm run test
npm run lint
npm run build
```

Frontend HTTP mode:

```bash
cd frontend
VITE_API_MODE=http VITE_API_BASE_URL=http://localhost:8000/api/v1 npm run dev
```

Backend quick local mode, useful when Docker is unavailable:

```bash
cd backend
AUTO_CREATE_TABLES=true \
DATABASE_URL=sqlite+aiosqlite:////tmp/image-translator-dev.db \
LOCAL_STORAGE_PATH=/tmp/image-translator-storage \
PUBLIC_BASE_URL=http://localhost:8000 \
conda run -n imagetranslator python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Backend quick local mode with real EasyOCR instead of mock OCR:

```bash
cd backend
AUTO_CREATE_TABLES=true \
DATABASE_URL=sqlite+aiosqlite:////tmp/image-translator-dev.db \
LOCAL_STORAGE_PATH=/tmp/image-translator-storage \
PUBLIC_BASE_URL=http://localhost:8000 \
OCR_PROVIDER=easyocr \
TRANSLATION_PROVIDER=mock \
conda run -n imagetranslator python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Testing Expectations

For backend changes:

- Run focused tests first, then `conda run -n imagetranslator pytest -q` when the change touches services, schemas, models, providers, or routes.
- Run `conda run -n imagetranslator ruff check <changed-python-files>` for Python changes.
- Add or update tests for service behavior, provider behavior, route contracts, and regression fixes.

For frontend changes:

- Run `npm run typecheck`.
- Run `npm run test`.
- Run `npm run lint`.
- Run `npm run build` for routed/page-level or production-sensitive changes.
- Use Playwright/browser verification for navigation, upload flows, editor/review/export flows, and visual layout issues.

For documentation-only changes:

- Tests are usually not required, but inspect rendered Markdown structure manually.

## Frontend Notes

- `VITE_API_MODE=mock` is the default and runs entirely in browser memory.
- `VITE_API_MODE=http` uses `src/api/httpAdapter.ts` and talks to the backend API.
- Top-level app routes live in `frontend/src/App.tsx`.
- Project routing logic lives in `frontend/src/lib/routing.ts`.
- Shared shell navigation lives in `frontend/src/components/TopNav.tsx` and `frontend/src/components/WorkspaceShell.tsx`.
- The sidebar Editor link must stay project-aware. Do not reintroduce hardcoded IDs such as `project-cyber`.
- The dashboard search reads and writes the `search` query parameter.
- OCR/translation are backend responsibilities; the frontend starts jobs, polls status, edits regions, and displays rendered assets.

## Backend Notes

- Processing entrypoint: `POST /api/v1/projects/{project_id}/process`.
- Route handler: `backend/app/api/routes/processing.py`.
- Main orchestration: `backend/app/services/processing_service.py`.
- Provider selection:
  - `backend/app/providers/ocr.py`
  - `backend/app/providers/translation.py`
  - `backend/app/providers/rendering.py`
- `_process_page()` normalizes the image, runs OCR, runs translation, writes `TextRegion` rows, renders cleaned/final/preview assets, and updates page status.
- Existing regions for a page are deleted before newly detected OCR regions are inserted during page processing.
- Region edits through `PATCH /api/v1/regions/{region_id}` mark the region as `user_edited`.
- Region retranslation calls the configured translation provider for one region and rerenders the page.
- Celery runs eagerly by default through `CELERY_TASK_ALWAYS_EAGER=true`.
- With `OCR_PROVIDER=easyocr`, processing uses real EasyOCR text detection/recognition. Translation remains mock unless a real translation provider is implemented and configured.

## Git and Workspace Hygiene

- The worktree may already contain user changes. Do not revert changes you did not make.
- Check `git status --short` before staging or committing.
- Stage only files relevant to the requested task.
- The `testing/` folder contains generated evidence and is intentionally ignored by git.
- `.gitignore` may have local changes; do not include it in commits unless the user asks or the task requires it.

## Known Sharp Edges

- Docker may not be running locally; use the SQLite backend command above if Docker is unavailable and Python dependencies are installed.
- System Python may not have backend dependencies; use the named `imagetranslator` conda env for backend work.
- Browser automation may require elevated permissions on macOS when Playwright launches Chromium or when a skill runner writes temporary execution files.
- Backend startup can fail in sandboxed mode when binding to port `8000`; rerun with the appropriate approval if needed.
- OpenAI/DeepL translation providers are stubs. Enabling those env vars without implementation will break processing jobs.
