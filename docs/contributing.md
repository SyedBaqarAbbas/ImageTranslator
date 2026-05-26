# Contributing

This page is for humans and coding agents working in the repository.

## Read the Instructions First

Follow the root `AGENTS.md` plus the nearest scoped file:

- `backend/AGENTS.md` for backend routes, services, DB, workers, and tests
- `backend/app/providers/AGENTS.md` for OCR, translation, and rendering providers
- `frontend/AGENTS.md` for frontend routes, UI, API adapters, and browser verification

## Branch and Worktree Hygiene

For Linear issue work:

1. Create a separate worktree.
2. Create a branch that includes the Linear issue key.
3. Base it on latest `main` unless told otherwise.
4. Preserve unrelated local/user changes.
5. Stage only files relevant to the task.
6. Commit with a prefix such as `[docs]`, `[fix]`, or `[ai-ops]`.
7. Push and open a normal PR against `main`.

Do not commit:

- secrets or `.env` files
- local databases
- uploaded assets
- rendered outputs
- model files
- build artifacts
- generated evidence under `testing/`

## Documentation Changes

Docs live in:

```text
docs/
mkdocs.yml
.github/workflows/docs.yml
```

When changing user-facing docs:

- document implemented behavior, not hoped-for behavior
- mark planned or unsupported behavior clearly
- use exact commands and paths
- keep screenshots free of secrets and private data
- run `mkdocs build --strict`

When adding screenshots, store them under:

```text
docs/assets/screenshots/
```

Use clear filenames such as `dashboard.png`, `upload-flow.png`, or `editor-view.png`.

## Testing Expectations

Use focused checks first, then relevant suites based on blast radius.

For docs-only changes:

```bash
mkdocs build --strict
```

For frontend changes:

```bash
cd frontend
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npm run test:e2e
npm run audit:buttons
```

For backend changes:

```bash
cd backend
conda run -n imagetranslator pytest -q --cov=app --cov-report=term-missing:skip-covered
conda run -n imagetranslator python -m compileall app migrations
```

For release-sensitive changes:

```bash
./up-and-test.sh
```

Update `RELEASE_TEST_MATRIX.md` whenever routes, API groups, workflows, or release-gate responsibilities change.
