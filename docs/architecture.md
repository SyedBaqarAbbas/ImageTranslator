# Architecture

ImageTranslator is a full-stack local workflow with a FastAPI backend and Vite React frontend.

## System Overview

```text
Browser
  |
  | Vite React UI
  v
Frontend API adapter
  |
  | HTTP mode: /api/v1
  | Mock mode: in-browser mock store
  v
FastAPI backend
  |
  | services + eager Celery tasks
  v
OCR provider -> translation provider -> Pillow renderer
  |
  v
Database rows + local file assets
```

## Backend Responsibilities

Backend code lives under `backend/`.

- API routes: `backend/app/api/routes/`
- Pydantic schemas: `backend/app/schemas/`
- SQLAlchemy models: `backend/app/models/`
- Business services: `backend/app/services/`
- Providers: `backend/app/providers/`
- Migrations: `backend/migrations/`
- Tests: `backend/app/tests/`

The backend owns:

- project, page, region, job, export, and asset persistence
- image and ZIP upload validation
- OCR and translation provider calls
- cleaned, preview, final, and export asset creation
- API response contracts
- processing and export failure states

## Frontend Responsibilities

Frontend code lives under `frontend/`.

- Routes: `frontend/src/App.tsx`
- API adapters: `frontend/src/api/`
- Screens: `frontend/src/pages/`
- Shared UI: `frontend/src/components/`
- API-aligned types: `frontend/src/types/`
- Playwright tests: `frontend/e2e/`

The frontend owns:

- upload/setup screens
- dashboard/search/filter workflow
- processing status polling
- review and editor UX
- per-region manual edits and render controls
- export job creation and download links
- mock-mode state for frontend demos and tests

## End-to-End Flow

1. User creates a project.
2. User uploads image pages or a ZIP archive.
3. Backend validates uploads, stores originals, and creates page records.
4. User starts project processing.
5. Backend creates a processing job and runs the task eagerly by default.
6. Processing normalizes each page, runs OCR, translates detected text, stores regions, cleans source text areas, and renders preview/final assets.
7. Frontend polls job and page state.
8. User reviews flagged regions and manually edits translations.
9. User exports ZIP, image ZIP, or PDF.
10. Backend creates an export asset and exposes a download URL.

## Prototype Boundaries

Current local workflow uses a shared public workspace user. Do not assume production auth, multi-tenant permissions, a separate queue service, or a hosted deployment architecture unless the project scope changes.

## Data and Assets

The backend stores metadata in PostgreSQL for Docker or SQLite for `start-local-prototype.sh`. Files are stored through the storage layer, with local filesystem storage as the default.

Common local paths:

```text
.local-data/image-translator-local-prototype.db
.local-data/storage/
backend/models/opus-mt/
```

These paths are local artifacts and should not be committed.
