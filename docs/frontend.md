# Frontend

The frontend is a Vite React app in `frontend/`.

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- React Router
- TanStack Query
- Vitest
- Playwright

## API Modes

The frontend has two API adapters:

| Mode | How to run | Behavior |
| --- | --- | --- |
| Mock | `VITE_API_MODE=mock npm run dev` | Uses `frontend/src/api/mockAdapter.ts`; no backend required |
| HTTP | `VITE_API_MODE=http VITE_API_BASE_URL=http://localhost:8000/api/v1 npm run dev` | Calls the FastAPI backend |

The default frontend dev script uses mock mode unless the environment overrides it. The root Docker and local prototype scripts run HTTP mode.

## Routes

Routes are defined in `frontend/src/App.tsx`.

| Route | Screen |
| --- | --- |
| `/` | Landing upload |
| `/projects` | Dashboard |
| `/projects/new` | Project setup |
| `/assets` | Asset browser |
| `/settings` | Workspace settings |
| `/batch-ocr` | Batch processing launcher |
| `/typefaces` | Typeface controls |
| `/archive` | Completed/export-ready projects |
| `/account` | Local profile surface |
| `/support` | Support form |
| `/projects/:projectId/processing` | Processing status |
| `/projects/:projectId/review` | Review queue |
| `/projects/:projectId/editor` | Translation editor |
| `/projects/:projectId/export` | Export |
| `/team` | Redirects to `/projects` in the current prototype |

## Main Workflow Screens

- `LandingUpload.tsx`: upload entry point
- `ProjectSetup.tsx`: project name, tone, replacement mode, reading direction, SFX setting
- `Processing.tsx`: job polling and page queue progress
- `Review.tsx`: low-confidence/flagged region approval
- `Editor.tsx`: page canvas, region editing, retranslation, style controls
- `Export.tsx`: ZIP/PDF/image ZIP export and download link

## Mock Data

Mock mode seeds safe sample projects in `frontend/src/data/mockData.ts`, including:

- `Cyber Neon Vol. 1`
- `Samurai Echoes`

The documentation screenshots use mock mode so no private uploads, tokens, or local model output are committed.

## Frontend Checks

Run from `frontend/`:

```bash
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npm run test:e2e
npm run audit:buttons
```

Every routed page should have render coverage, and visible buttons must be represented in the button audit expectation manifests under `frontend/tests/button-audit/pages/`.
