# AGENTS.md

Project-wide guidance for Codex and other coding agents working in this repository.

## Project Summary

ImageTranslator is a full-stack manga/comic translation workflow.

- Backend: FastAPI, SQLAlchemy 2 async, Alembic, PostgreSQL/SQLite dev support, Celery eager jobs, Pillow rendering, local/S3-style asset storage, OCR/translation/rendering provider interfaces.
- Frontend: Vite, React, TypeScript, Tailwind CSS, React Router, TanStack Query, Vitest, and Playwright.
- Workflow: upload pages, configure project settings, run processing, review/edit detected regions, render translated pages, and export ZIP/PDF/images.

## Scoped Instructions

Follow the nearest scoped `AGENTS.md` in addition to this file:

- `backend/AGENTS.md` for backend setup, tests, routes, services, DB, and worker behavior.
- `backend/app/providers/AGENTS.md` for OCR, translation, and rendering provider work.
- `frontend/AGENTS.md` for frontend setup, API adapters, routing, UI, and browser verification.

Do not add more nested `AGENTS.md` files unless a major area has distinct rules that would otherwise distract unrelated work.

## Current Product Scope

- Prototype-first local workflow. Do not add auth/users, multi-workspace permissions, a separate queue, or a new worker architecture unless the user explicitly changes scope.
- Workflow API routes use a shared public workspace user; no frontend auth token is required in local HTTP mode.
- The next-step prototype roadmap lives in `PROTOTYPE_IMPLEMENTATION_PLAN.md`.

## Repo Layout

```text
backend/    FastAPI backend, Alembic migrations, providers, services, tests
frontend/   Vite React app, API adapters, routed screens, E2E tests
testing/    Manual/browser test evidence; ignored by git
```

## Root Commands

Docker workflow:

```bash
docker compose up --build
docker compose down
docker compose logs -f api
docker compose logs -f frontend
```

Documentation-only changes usually do not need tests, but inspect Markdown structure manually.

## Git and Workspace Hygiene

- The worktree may already contain user changes. Do not revert changes you did not make.
- Check `git status --short` before staging or committing.
- Stage only files relevant to the requested task.
- Use commit messages in the format `[prefix] <message>`, for example `[fix] handle empty OCR results` or `[docs] update setup notes`.
- The `testing/` folder contains generated evidence and is intentionally ignored by git.
- `.gitignore` may have local changes; do not include it in commits unless the user asks or the task requires it.
- When fixing issues from Linear, automations only run if the branch name contains the ticket. Checkout to the branch name containing ticket name.

## Known Sharp Edges

- Docker may not be running locally; backend SQLite local mode is documented in `backend/AGENTS.md`.
- System Python may not have backend dependencies; use the `imagetranslator` conda env for backend work.
- Browser automation may require elevated permissions on macOS when Playwright launches Chromium or when a skill runner writes temporary execution files.
- OpenAI/DeepL translation providers are stubs. Enabling those env vars without implementation will break processing jobs.
