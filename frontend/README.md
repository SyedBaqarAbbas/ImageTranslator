# ComicFlow AI Frontend

React frontend for the ImageTranslator manga/comic translation workflow. The app implements the static `stitch_mangatranslate_ai` designs as a routed, typed Vite application with upload, setup, dashboard, processing, editor, review, export, and workspace utility screens.

## Stack

- Vite + React + TypeScript
- Tailwind CSS
- React Router
- TanStack Query
- Vitest
- Playwright

## Getting Started

Install dependencies:

```bash
npm install
```

Run the local dev server:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

## API Mode

The frontend defaults to the in-browser mock adapter so the workflow is usable without backend routes.

To point the app at the backend HTTP adapter:

```bash
VITE_API_MODE=http VITE_API_BASE_URL=http://localhost:8000/api/v1 npm run dev
```

The current backend workflow routes use a shared public workspace user, so no login or local storage token is required for local HTTP mode.

## Routes and Screens

Primary workflow routes:

- `/`: landing upload screen.
- `/projects`: project dashboard with search and status filters.
- `/projects/:projectId/processing`: processing queue and job progress.
- `/projects/:projectId/review`: low-confidence review queue.
- `/projects/:projectId/editor`: page editor with regions and translation controls.
- `/projects/:projectId/export`: ZIP/PDF/images export screen.

Workspace routes:

- `/assets`: uploaded/generated page asset browser.
- `/team`: collaborator invite surface.
- `/settings`: workspace defaults.
- `/batch-ocr`: project processing launcher.
- `/typefaces`: per-project font preset controls.
- `/archive`: completed/export-ready projects.
- `/account`: local profile surface.
- `/support`: support request surface.

The top nav search submits to `/projects?search=...`; the Dashboard reads that query parameter and filters project cards. Notifications, Help, and Share controls open local popovers with visible feedback.

## OCR and Translation UI Flow

The frontend does not run OCR or translation in the browser. It starts backend processing through the API adapter and displays the resulting job, page, and region records.

In HTTP mode:

1. The Processing screen calls `api.processProject(projectId, { force: true })`.
2. It polls `api.getProcessingJobs(projectId)`, `api.getProject(projectId)`, and `api.listPages(projectId)` every 1.5 seconds.
3. Once the backend marks the project ready for review, the UI links to the Review screen.
4. The Review and Editor screens call `api.listRegions(pageId)` to show OCR boxes, detected text, translated text, confidence, and statuses.
5. Edits call `api.updateRegion(regionId, payload)`.
6. Retranslation calls `api.retranslateRegion(regionId, payload)`, which is handled by the backend provider.
7. Export calls `api.createExport(projectId, payload)` and polls the export job until a download asset exists.

In mock mode, `src/api/mockAdapter.ts` simulates these state transitions entirely in memory. Mock uploads create preview assets, mock processing moves pages toward `review_required`, and mock region data is seeded for editor/review testing.

## Scripts

```bash
npm run dev         # Start Vite
npm run build       # Typecheck and build production assets
npm run preview     # Serve the production build locally
npm run lint        # Run ESLint
npm run typecheck   # Run TypeScript checks
npm test            # Run unit tests
npm run test:e2e    # Run Playwright smoke tests
```

## Project Structure

```text
src/api/          API adapters and query keys
src/components/   Shared UI components
src/data/         Mock seed data
src/lib/          UI helpers and workflow context
src/pages/        Routed workflow and workspace screens
src/types/        Backend-aligned TypeScript contracts
e2e/              Playwright smoke tests
```

## Notes

- `VITE_API_MODE=mock` is the default and simulates processing/export state transitions.
- `VITE_API_MODE=http` centralizes endpoint paths in `src/api/httpAdapter.ts`.
- OCR and translation are backend responsibilities; the frontend only starts jobs, polls state, edits regions, and displays rendered assets.
- The reference stitch design exports are intentionally ignored by `frontend/.gitignore`.
