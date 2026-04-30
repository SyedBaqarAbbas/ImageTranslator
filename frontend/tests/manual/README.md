# Manual Browser Scripts

These are committed copies of reusable browser scripts that used to live under ignored `testing/`.

Run them from `frontend/` with the relevant frontend/backend servers already running:

```bash
node tests/manual/basic-functionality-playwright.cjs
node tests/manual/navbar-audit-playwright.cjs
node tests/manual/navbar-fix-playwright.cjs
```

They write generated evidence under the ignored root `testing/` directory.
