# Release Test Matrix

This matrix is the source of truth for MVP release-gate coverage. Update it whenever routes, API groups, workflows, or test responsibilities change.

## Release Gate

Run the default release gate from the repo root:

```bash
./up-and-test.sh
```

Default gate expectations:

- Backend pytest with coverage and Python compile.
- Frontend typecheck, lint, Vitest coverage, build, Playwright smoke/route tests, button audit, and navbar audit.
- Mock full-stack HTTP E2E.
- OPUS-MT missing-model failure E2E.
- Frontend Docker Compose and hosted CI run on Node 24 LTS; major Node
  runtime changes need an explicit dependency-policy review before merging.
- Docker Compose uses `postgres:18-alpine`; major Postgres image changes must
  be validated from a clean compose volume and include local-volume caveats.
- Real-provider UI E2E only when explicitly enabled with `RUN_REAL_PROVIDER_E2E=1 REAL_E2E_TEST_IMAGE=/path/to/image`.

## GitHub Automation

The GitHub `CI` workflow is the required PR baseline for hosted collaboration.
It always runs a lightweight `Detect app changes` job first, then selects app
jobs by changed path:

- `Backend tests and compile`: runs for backend-impacting changes such as
  `backend/**` code/config/test files, shared root E2E files, root Docker/local
  launcher files, root `up-and-test.sh`, and workflow files. When selected, it
  installs backend dev dependencies, runs pytest with coverage, and compiles
  `app` and `migrations`.
- `Frontend typecheck, lint, tests, build, and Playwright`: runs for
  frontend-impacting changes such as `frontend/**` code/config/test files,
  shared root E2E files, root Docker/local launcher files, root `up-and-test.sh`,
  and workflow files. When selected, it installs frontend dependencies with
  `npm ci` on Node 24 LTS, runs typecheck, lint, Vitest coverage, production
  build, installs Chromium, and runs the mock-mode Playwright smoke/route tests.
- Docs-only, issue-template-only, PR-template-only, governance-only, and
  AI-instruction-only changes skip the expensive app jobs and complete through
  the lightweight `No app checks required` job.
- Manual `workflow_dispatch` runs select both backend and frontend app jobs
  regardless of changed paths.

The GitHub `CodeQL` workflow runs on pull requests, pushes to `main`, a weekly
schedule, and manual dispatch. Pull request and push runs are path-aware:
backend/Python-impacting changes select `Analyze (python)`, frontend/root E2E
JavaScript or TypeScript changes select `Analyze (javascript-typescript)`, and
workflow changes select both languages. Docs-only and governance-only changes
complete through `No CodeQL analysis required` without running language scans.
Scheduled and manual CodeQL runs still analyze both configured languages so
security coverage remains available in the repository Security tab.

The local `./up-and-test.sh` release gate remains broader than hosted CI and
should still be run before release-sensitive merges.

## Frontend Routes

| Route | Normal render | State coverage target | Browser/E2E target |
| --- | --- | --- | --- |
| `/` | Landing upload tests | File chooser, unsupported files, selected files | Upload to setup flow |
| `/projects` | Dashboard tests | Loading, empty, search, sort, delete failure | Dashboard route and search |
| `/projects/new` | Project setup tests | Missing files, locked language, create failure | Upload setup to processing |
| `/assets` | Assets tests | Loading, empty, API error, project/page assets | Route coverage |
| `/team` | Redirect test | Prototype redirect to `/projects` | Navbar/button audit redirect |
| `/settings` | Settings tests | Runtime language loading/error, save state | Route coverage |
| `/batch-ocr` | Batch OCR tests | Empty projects, run OCR API call/failure | Button audit |
| `/typefaces` | Typefaces tests | Empty projects, font update/failure | Button audit |
| `/archive` | Archive tests | Empty archive, export-ready projects | Route coverage |
| `/account` | Account tests | Save profile state | Button audit |
| `/support` | Support tests | Empty validation, drafted request | Button audit |
| `/projects/:id/processing` | Processing tests | Running, success, failed, cancel/rerun | Full-stack workflow |
| `/projects/:id/review` | Review tests | No regions, approve, API error | Full-stack workflow |
| `/projects/:id/editor` | Editor tests | Missing project/page, save, retranslate, reject, drag/resize | Editor E2E |
| `/projects/:id/export` | Export tests | PDF/ZIP/images, no pages, failed export | Full-stack export workflow |
| `*` | Redirect test | Unknown routes redirect to `/projects` | Route coverage |

## Backend API Groups

| API group | Required success coverage | Required failure coverage |
| --- | --- | --- |
| Health/runtime/users | Health, runtime language, public user | Runtime provider config edge cases, auth routes not exposed |
| Projects/settings | Create/list/detail/update/delete/settings | Validation, missing project, deleted project |
| Pages/upload | Multi-image upload, ZIP upload, page detail/list | Empty upload, unsupported type, corrupt image, too many pages, missing page |
| Processing/jobs | Project process, page reprocess, rerender, job list/detail | No pages, OCR no text, provider failure, missing job |
| Regions | List/update/delete/rerender/retranslate | Missing region/page, translation failure, rerender failure |
| Exports/assets | PDF, full ZIP, image ZIP, include originals, downloads | No pages, no rendered pages, missing export/asset/key |
| Events | Project event stream first payload | Missing project |

## Button Audit Rules

Every visible button must be classified in `frontend/tests/button-audit/pages/*.cjs` as one of:

- `navigates`
- `opensPopover`
- `changesUiState`
- `mutatesApi`
- `opensFileChooser`
- `downloads`
- `disabledExpected`
- `currentSelection`
- `intentionalNoop`

The audit fails when a visible button is unclassified, errors, emits unexpected failed requests, or does not produce the expected outcome.

## Provider Coverage

| Provider mode | Default gate | Coverage target |
| --- | --- | --- |
| Mock OCR/translation/rendering | Yes | Fast deterministic workflow coverage |
| OPUS-MT missing model | Yes | Failure state and user-facing error propagation |
| Tesseract + OPUS-MT Korean | Opt-in | Real OCR/translation happy path |
| Tesseract + OPUS-MT Japanese | Opt-in | Add when a stable Japanese fixture is available |
