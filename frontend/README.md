# ComicFlow AI Frontend

React frontend for the ImageTranslator manga/comic translation workflow. The app implements the static `stitch_mangatranslate_ai` designs as a routed, typed Vite application with upload, setup, dashboard, processing, editor, review, and export screens.

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
src/pages/        Routed screens
src/types/        Backend-aligned TypeScript contracts
e2e/              Playwright smoke tests
```

## Notes

- `VITE_API_MODE=mock` is the default and simulates processing/export state transitions.
- `VITE_API_MODE=http` centralizes endpoint paths in `src/api/httpAdapter.ts`.
- The reference stitch design exports are intentionally ignored by `frontend/.gitignore`.
