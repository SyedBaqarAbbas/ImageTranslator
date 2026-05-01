---
name: linear-ticket-writer
description: Use this skill when creating, drafting, or refining Linear tickets for ImageTranslator work. It produces comprehensive implementation-ready tickets that include product context, code entry points, current and desired behavior, acceptance criteria, validation steps, and enough detail for an unfamiliar Codex CLI agent to complete the work end to end.
---

# Linear Ticket Writer

Create Linear tickets that an unfamiliar implementation agent can pick up without needing the original conversation. The ticket must explain the app, the problem, the relevant files, the expected behavior, and how to verify completion.

## Operating Rules

- Do not implement the feature while writing the ticket unless the user explicitly asks for implementation too.
- Read local context before drafting. At minimum inspect `AGENTS.md`, scoped `AGENTS.md` files, `git status --short`, and the relevant frontend/backend files.
- Preserve user changes. Do not revert or stage unrelated files.
- Prefer exact repo paths, route names, API endpoints, commands, and component/service names over generic descriptions.
- Write for an agent that does not know ImageTranslator, React Query, FastAPI routes, or the current prototype scope.
- Make assumptions explicit. If a product decision is ambiguous, include a recommended default and a "Decision Needed" section.
- Keep tickets scoped to one deliverable. If the request contains multiple independent problems, create one ticket per problem plus an optional parent/overview issue.
- Avoid vague acceptance criteria like "works correctly". Every criterion should be observable.

## Context To Gather

Before creating a ticket, gather only the context needed for that issue:

1. Product flow: where the user sees the problem and what they are trying to accomplish.
2. Current behavior: what the app does today, including disabled/no-op buttons or errors.
3. Relevant code paths:
   - frontend routes, pages, components, API adapters, tests
   - backend routes, schemas, services, models, tests
   - scripts or config when the ticket is operational
4. Data contracts and APIs: request/response types, endpoint paths, query keys, mutation behavior.
5. Verification commands from scoped `AGENTS.md` files.
6. Risks: stale cache, mock-vs-HTTP differences, migrations, renderer side effects, storage, or unclear UX.

Useful commands:

```bash
git status --short
rg --files -g 'AGENTS.md' -g 'README*' -g 'package.json' -g 'pyproject.toml'
rg -n "search terms from the user request" frontend backend
```

## Linear Issue Shape

Use this structure for every ticket unless the user asks for a different format:

```markdown
## Summary

One or two sentences describing the deliverable and why it matters.

## Product Context

Briefly explain ImageTranslator and the specific workflow surface.
Name the route/screen and what the user is trying to do.

## User Problem

Describe the pain in user terms, not implementation terms.

## Current Behavior

List observed current behavior from code inspection or reproduction.
Include exact file paths, components, routes, endpoints, or scripts.

## Desired Behavior

State the user-visible end state.

## Relevant Code

- `path/to/file.tsx`: why it matters
- `path/to/service.py`: why it matters

## Implementation Notes

Concrete guidance for the implementing agent.
Mention data contracts, state changes, cache invalidation, UI states, backend behavior, and edge cases.

## Acceptance Criteria

- Observable criterion 1
- Observable criterion 2
- Observable criterion 3

## Verification Plan

Commands and manual steps.
Include mock mode vs HTTP mode when relevant.

## Out of Scope

Things the agent should not do in this ticket.

## Dependencies / Follow-Ups

Only include if relevant.
```

## Quality Bar

A good ticket lets the next agent answer these questions without asking the user:

- What screen, route, or API is involved?
- What is broken or missing today?
- What exact behavior should be delivered?
- Which files should the agent inspect first?
- What data needs to be persisted or invalidated?
- What should happen in loading, success, empty, and error states?
- How can the agent prove the work is done?
- What should not be changed?

## ImageTranslator Defaults

Use this project context when relevant:

- ImageTranslator is a local-first manga/comic translation workflow.
- Users upload pages, configure translation settings, process OCR/translation/rendering, review detected regions, edit translated overlays, and export final output.
- Frontend: Vite, React, TypeScript, Tailwind CSS, React Router, TanStack Query.
- Backend: FastAPI, SQLAlchemy async, local/S3-style storage, Celery eager jobs, Pillow rendering.
- Prototype scope: no auth/users, no multi-workspace permissions, no separate queue architecture unless explicitly requested.
- Local HTTP mode does not require an auth token and uses a shared public workspace user.
- Mock mode uses `frontend/src/api/mockAdapter.ts`; HTTP mode uses `frontend/src/api/httpAdapter.ts`.

Common paths:

- Routes: `frontend/src/App.tsx`
- Top nav and shell: `frontend/src/components/TopNav.tsx`, `frontend/src/components/WorkspaceShell.tsx`
- Editor: `frontend/src/pages/Editor.tsx`
- Canvas overlay: `frontend/src/components/CanvasWorkspace.tsx`
- Translation cards: `frontend/src/components/RegionPanel.tsx`
- Dashboard/cards: `frontend/src/pages/Dashboard.tsx`, `frontend/src/components/ProjectCard.tsx`
- Export: `frontend/src/pages/Export.tsx`
- Settings: `frontend/src/pages/Settings.tsx`
- Frontend API contracts/adapters: `frontend/src/types/api.ts`, `frontend/src/api/httpAdapter.ts`, `frontend/src/api/mockAdapter.ts`
- Backend project/region/export routes: `backend/app/api/routes/projects.py`, `backend/app/api/routes/regions.py`, `backend/app/api/routes/exports.py`
- Backend services: `backend/app/services/project_service.py`, `backend/app/services/region_service.py`, `backend/app/services/export_service.py`, `backend/app/services/processing_service.py`
- Local launcher: `start-local-prototype.sh`

Verification defaults:

```bash
cd frontend
npm run typecheck
npm run test
npm run build
```

When backend Python changes are expected:

```bash
cd backend
conda run -n imagetranslator pytest -q
conda run -n imagetranslator python -m compileall app migrations
```

## Linear Creation Workflow

If a Linear connector/tool is available and the user asks to create the ticket in Linear:

1. Draft the ticket content first.
2. Choose the Linear team/project/labels from user input or existing workspace conventions.
3. If priority is not provided, infer from impact and mark the inference in the ticket.
4. Create the Linear issue with:
   - concise title
   - full Markdown body
   - labels/components if available
   - links to local ticket docs or PRs if supplied
5. Return the Linear issue identifier and URL.

If no Linear tool is available, output the ticket in Markdown with a clear title and body ready to paste into Linear.

