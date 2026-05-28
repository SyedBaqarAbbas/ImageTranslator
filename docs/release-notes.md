# Release Notes

This page keeps the public release history for ImageTranslator. The newest
release appears first, and earlier releases stay below it for reference.

## Releases

- [v0.0.2 - Editor workflow and deployment automation](#v002-editor-workflow-and-deployment-automation-may-28-2026)
- [v0.0.1 - Public MVP](#v001-public-mvp-may-9-2026)

## v0.0.2 - Editor Workflow and Deployment Automation - May 28, 2026

v0.0.2 focuses on making the editor feel like a real review workspace and on
preparing the hosted prototype for repeatable deployment from `main`. It adds
manual region creation, targeted OCR, usable undo/back behavior, export output
that reflects current editor styling, and an OCI deployment workflow guarded by
CI and health checks.

### Highlights

- Manual text boxes: add translated text boxes directly on the editor canvas,
  then edit text, size, fill, color, and placement before export.
- Highlighted OCR regions: draw a region over source artwork, run OCR on just
  that crop, edit the detected source text, and retranslate it without rerunning
  the whole page.
- Editor undo and back controls: undo now restores recent region edits,
  movement, and style changes, with visible pending/success/error feedback.
- Export style fidelity: ZIP, image ZIP, and PDF exports render from the
  current region state and preserve editor text color, fill color, opacity,
  text size, and clipping behavior.
- Better compare/review behavior: the compare view uses the editable translated
  output so recent editor changes are visible before export.
- Region failure refresh: failed OCR or translation work updates the selected
  region and page state instead of leaving stale pending feedback.
- OCI prototype deployment: the new `Deploy OCI` workflow deploys successful
  `main` CI pushes to the `production-oci` environment and supports manual
  redeploys from `main`.

### Deployment And Operations

- Automatic OCI deploys run only after successful `CI` workflow runs for
  `main` pushes; pull request runs do not receive deployment secrets or deploy
  the prototype.
- The deploy job verifies the fetched `origin/main` SHA against the successful
  CI commit before updating the server checkout.
- Deployment uses environment-scoped SSH secrets, pinned known hosts, serialized
  `production-oci` concurrency, Docker Compose config validation, rebuilds, and
  frontend/API health checks.
- The workflow intentionally preserves server-only runtime state, including
  `.env` files, OPUS-MT model folders, uploaded assets, rendered outputs, and
  Postgres/Docker volumes.

### Documentation And Testing

- Deployment documentation now includes the `production-oci` environment setup,
  required secrets and variables, host prerequisites, smoke checks, and rollback
  expectations.
- The release test matrix now covers manual text boxes, manual OCR region
  creation, region OCR API behavior, and OCI deployment responsibilities.
- Backend tests cover region creation, region OCR, failure state handling,
  export rendering from current region data, and renderer style fidelity.
- Frontend tests cover editor tool selection, add-text flow, highlighted OCR,
  undo behavior, save feedback, export-visible style drafts, and button audit
  expectations.

### Current Limitations

- ImageTranslator is still prototype-first local software, not a hosted
  multi-tenant product.
- The hosted OCI deployment depends on GitHub environment configuration and an
  existing server checkout prepared with Docker, Compose, runtime `.env` files,
  and OPUS-MT model folders.
- Manual OCR quality depends on the configured OCR provider and the clarity of
  the highlighted source crop.

## v0.0.1 - Public MVP - May 9, 2026

ImageTranslator's first public MVP is a local-first workflow for translating
manga, manhwa, comics, and scanned image pages. It gives users an end-to-end
path to upload pages, run OCR and translation, review detected text regions,
correct translated text, render final pages, and export the result.

This release is intended for local evaluation, prototype feedback, and
contributor collaboration. The default setup uses real local providers:
Tesseract OCR, OPUS-MT translation, and Pillow rendering. No hosted account or
external translation API key is required for the default local run.

### What Is Included

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

### How To Run

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

### Validation

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

### Current Limitations

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

### Feedback And Support

- For contribution setup, see [Contributing](contributing.md).
- For provider details, see [Providers](providers.md).
- For common setup and workflow issues, see [Troubleshooting](troubleshooting.md).
