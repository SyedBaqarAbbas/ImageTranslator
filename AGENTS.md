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

## Testing Expectations

- Add or update comprehensive tests for every behavior change, bug fix, and meaningful refactor.
- Treat testing as the final validation step after implementation is complete: run focused tests first, then relevant existing suites based on the blast radius.
- Run e2e/browser tests when changes affect navigation, routed workflows, upload, processing, editor, review, export, or other cross-screen UI behavior.
- If a change touches shared contracts or infrastructure, run the existing frontend/backend tests needed to prove no regressions were introduced.
- Keep `./up-and-test.sh` as the release gate. It must start the required local app environments and run backend coverage, frontend coverage, Playwright smoke/route tests, button/nav audits, mock full-stack E2E, and provider failure checks.
- Do not rely on coverage percentage alone. Tests must assert business outcomes: persisted state, API calls, job status, generated assets/downloads, routed navigation, validation errors, and failure messages.
- Every visible frontend button must be covered by the button audit expectation manifest. Classify each button as navigation, popover/menu, UI state change, API mutation, file chooser, download, disabled/current, or intentional no-op.
- Every routed page in `frontend/src/App.tsx` must have tests for its normal render path. Data-driven routes should also cover loading, empty, error, and not-found states when the page supports those states.
- When adding or changing backend routes, add both success and meaningful failure tests. Validate response contracts and state transitions, not just status codes.
- Update `RELEASE_TEST_MATRIX.md` whenever routes, API groups, workflows, or release-gate test responsibilities change.

## Git and Workspace Hygiene

- The worktree may already contain user changes. Do not revert changes you did not make.
- Run `git status --short` before staging or committing.
- Stage only files relevant to the task. Do not use `git add .` unless required.
- Commit messages must follow `[prefix] <message>`, e.g. `[fix] handle empty OCR results`.
- Whenever making a change to AI workflows (AGENTS.md or SKILL.md), use the prefix [ai-ops] in your git commits.
- `testing/` contains generated evidence and is ignored by git. Do not force-add it.
- Do not commit `.gitignore` unless asked or required.
- Do not commit secrets, `.env` files, local DBs, model files, uploaded assets, rendered outputs, or build artifacts.

## Linear Issue Workflow

- Use a separate git worktree for Linear fixes.
- Create a branch containing the Linear ticket ID/name.
- Base it on latest `main` unless told otherwise.
- Commit with a meaningful `[prefix] <message>`.
- Whenever making a change to AI workflows (AGENTS.md or SKILL.md), use the prefix [ai-ops] in your git commits.
- Push the branch.
- Create a normal open PR against `main`, not a draft PR, unless the user explicitly asks for a draft. Always use gh outside of sandbox for this (gh inside the sandbox does not have access to keyring).
- If you are blocked because of any issue, post a comment on the ticket in Linear through MCP in 2 stages: first, summarizing the issue in one-line for a general idea and second, explaining it comprehensively for a detailed specific idea.

## Known Sharp Edges

- Docker may not be running locally; backend SQLite local mode is documented in `backend/AGENTS.md`.
- System Python may not have backend dependencies; use the `imagetranslator` conda env for backend work.
- Browser automation may require elevated permissions on macOS when Playwright launches Chromium or when a skill runner writes temporary execution files.
- Unsupported translation provider values can break processing jobs. Use the documented providers in `backend/.env.example` and `backend/README.md`.
