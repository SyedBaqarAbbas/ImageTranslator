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
- Real-provider UI E2E only when explicitly enabled with `RUN_REAL_PROVIDER_E2E=1 REAL_E2E_TEST_IMAGE=/path/to/image`.

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
| Health/runtime/users | Health, runtime language, public user | Runtime provider config edge cases |
| Auth | Register/login compatibility | Duplicate email, invalid credentials, disabled user |
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
