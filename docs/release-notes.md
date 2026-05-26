# Release Notes

## Public MVP - May 9, 2026

ImageTranslator's first public MVP is a local-first workflow for translating
manga, manhwa, comics, and scanned image pages. It gives users an end-to-end
path to upload pages, run OCR and translation, review detected text regions,
correct translated text, render final pages, and export the result.

This release is intended for local evaluation, prototype feedback, and
contributor collaboration. The default setup uses real local providers:
Tesseract OCR, OPUS-MT translation, and Pillow rendering. No hosted account or
external translation API key is required for the default local run.

## What Is Included

- End-to-end project workflow: upload image pages or ZIP archives, configure a
  project, process pages, review detected regions, edit translations, render
  outputs, and export finished work.
- Real local provider defaults: Docker and `start-local-prototype.sh` default
  to Tesseract OCR, OPUS-MT translation, and Pillow rendering.
- Deterministic mock modes: use mock OCR/translation for quick demos,
  screenshots, frontend-only exploration, or repeatable tests.
- Review and editor tools: approve, reject, save edits, retranslate individual
  regions, drag and resize regions, switch original/translated views, compare
  output, and adjust text color, fill, opacity, and size before export.
- Export workflows: generate a full ZIP, PDF, or translated image ZIP, with
  optional original assets for ZIP formats.
- Local persistence: the host-run prototype stores SQLite data and generated
  assets under repo-local `.local-data` by default.
- Public documentation: this docs site includes screenshots, setup guides, user
  workflow docs, architecture notes, backend API notes, frontend notes, and
  provider configuration details.
- Public project hygiene: CI, CodeQL, MkDocs documentation workflow,
  contribution docs, support docs, security policy, issue templates, and a
  release gate are included.

## How To Run

For the full local prototype with backend, frontend, local storage, SQLite,
Tesseract OCR, and OPUS-MT translation:

```bash
./start-local-prototype.sh
```

Open:

- App: `http://127.0.0.1:5173`
- API health: `http://127.0.0.1:8000/api/v1/health`
- API docs: `http://127.0.0.1:8000/docs`

For Docker-managed services and PostgreSQL:

```bash
cd backend
./scripts/setup_opus_mt_models.sh
cd ..
docker compose up --build
```

For deterministic backend-backed mock mode:

```bash
OCR_PROVIDER=mock TRANSLATION_PROVIDER=mock ./start-local-prototype.sh
```

For UI-only mock mode:

```bash
cd frontend
VITE_API_MODE=mock npm run dev
```

See [Getting Started](getting-started.md), [Local Setup](local-setup.md),
[Docker](docker.md), and [Troubleshooting](troubleshooting.md) for
prerequisites, model preparation, environment variables, and troubleshooting.

## Validation

The MVP release gate runs from the repo root:

```bash
./up-and-test.sh
```

The gate covers backend tests and compile checks, frontend typecheck/lint/unit
coverage/build checks, Playwright route and workflow tests, button and navbar
audits, mock full-stack HTTP E2E, and OPUS-MT missing-model failure handling.

Hosted automation includes path-aware CI, CodeQL, and a MkDocs workflow. The
docs workflow runs `mkdocs build --strict` for documentation changes and
deploys the generated site to GitHub Pages from `main`.

## Current Limitations

- This is prototype-first local software, not a hosted multi-tenant product.
- There is no public account system, auth flow, billing, workspace management,
  or hosted background queue.
- Real local translation requires OPUS-MT model files prepared under
  `backend/models/opus-mt`; the model files are intentionally not committed.
- Real backend HTTP uploads currently support image files and ZIP archives of
  image pages. PDF appears in the mock frontend upload UI for demo coverage,
  but real HTTP processing should use images or ZIP archives.
- Provider configuration is environment-variable based. The Settings screen
  shows runtime defaults but does not edit provider credentials or model paths.
- Translation quality depends on the local OCR and translation models used for
  the source material.

## Feedback And Support

- For contribution setup, see [Contributing](contributing.md).
- For provider details, see [Providers](providers.md).
- For common setup and workflow issues, see [Troubleshooting](troubleshooting.md).
