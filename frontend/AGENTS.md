# AGENTS.md

Frontend-specific guidance. Also follow the root `AGENTS.md`.

## Stack

- Vite, React, TypeScript, Tailwind CSS, React Router, TanStack Query, Vitest, and Playwright.
- `VITE_API_MODE=mock` is the default and runs entirely in browser memory.
- `VITE_API_MODE=http` uses `src/api/httpAdapter.ts` and talks to the backend API.

## Key Frontend Paths

- `src/App.tsx` top-level app routes.
- `src/api/` mock/http adapters and query keys.
- `src/components/TopNav.tsx` and `src/components/WorkspaceShell.tsx` shared shell navigation.
- `src/lib/routing.ts` project routing helpers.
- `src/pages/` routed screens.
- `src/types/` API-aligned TypeScript types.

## Behavior Notes

- Keep the sidebar Editor link project-aware. Do not reintroduce hardcoded IDs such as `project-cyber`.
- The dashboard search reads and writes the `search` query parameter.
- OCR/translation are backend responsibilities; the frontend starts jobs, polls status, edits regions, and displays rendered assets.

## Commands

Run from `frontend/`:

```bash
npm run typecheck
npm run test
npm run lint
npm run build
```

Frontend HTTP mode:

```bash
VITE_API_MODE=http VITE_API_BASE_URL=http://localhost:8000/api/v1 npm run dev
```

Run `npm run build` for routed/page-level or production-sensitive changes. Use Playwright/browser verification for navigation, upload flows, editor/review/export flows, and visual layout issues.
