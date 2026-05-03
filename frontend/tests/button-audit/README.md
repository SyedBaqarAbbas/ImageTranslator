# Button Audit Scripts

These scripts click every visible button on a page from a fresh browser context and verify the button against a page-level expectation manifest.

Observable changes include URL changes, page text changes, DOM/button-state changes, file chooser events, downloads, dialogs, popups, console warnings/errors, page errors, and failed requests.

Each page script in `tests/button-audit/pages/` must classify every visible button as one of:

- `navigates`
- `opensPopover`
- `changesUiState`
- `mutatesApi`
- `opensFileChooser`
- `downloads`
- `disabledExpected`
- `currentSelection`
- `intentionalNoop`

The audit fails when a visible button is unclassified, errors, emits unexpected failed requests, or does not produce its expected outcome. Add or update the page manifest whenever adding, removing, or changing a button.

Run the frontend in mock mode first:

```bash
cd frontend
VITE_API_MODE=mock npm run dev -- --host 127.0.0.1 --port 5173
```

Run every page audit:

```bash
cd frontend
node tests/button-audit/run-all.cjs
```

Audits run headless by default. To watch Chromium click through the page:

```bash
cd frontend
HEADLESS=false node tests/button-audit/pages/editor.cjs
```

Run one page audit:

```bash
cd frontend
node tests/button-audit/pages/editor.cjs
```

Run a subset through the aggregate runner:

```bash
cd frontend
BUTTON_AUDIT_PAGES=landing,editor npm run audit:buttons
```

Project-specific page scripts first try the seeded mock project routes. If the app is running in HTTP mode and those seeded projects do not exist, the scripts create or reuse a lightweight backend project with one tiny PNG page before testing editor/review/processing/export routes.

Useful environment variables:

```bash
TARGET_URL=http://127.0.0.1:5173
BUTTON_AUDIT_API_BASE_URL=http://127.0.0.1:8000/api/v1
BUTTON_AUDIT_PROJECT_ID=existing-project-id
HEADLESS=false
RESULTS_DIR=/path/to/repo/testing/button-audit
FAIL_ON_STALE=true
```

Reports are written under `testing/button-audit/`, which is ignored by git and should only contain generated evidence.
