# Button Audit Scripts

These scripts click every visible enabled button on a page from a fresh browser context and record whether anything observable happened.

Observable changes include URL changes, page text changes, DOM/button-state changes, file chooser events, downloads, dialogs, popups, console warnings/errors, page errors, and failed requests.

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

Useful environment variables:

```bash
TARGET_URL=http://127.0.0.1:5173
HEADLESS=false
RESULTS_DIR=/path/to/repo/testing/button-audit
FAIL_ON_STALE=true
```

Reports are written under `testing/button-audit/`, which is ignored by git and should only contain generated evidence.
