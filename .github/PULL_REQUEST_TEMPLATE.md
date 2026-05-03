## Summary

-

## Linked Issue

- Linear:
- GitHub:

## Screenshots or Recordings

Add screenshots, recordings, or a short note when the change affects visible UI.

## Test Evidence

- [ ] Backend tests: `conda run -n imagetranslator pytest -q --cov=app --cov-report=term-missing:skip-covered`
- [ ] Backend compile: `conda run -n imagetranslator python -m compileall app migrations`
- [ ] Frontend typecheck: `npm run typecheck`
- [ ] Frontend lint: `npm run lint`
- [ ] Frontend unit coverage: `npm run test:coverage`
- [ ] Frontend build: `npm run build`
- [ ] Frontend E2E: `npm run test:e2e`
- [ ] Button audit, when visible buttons change: `npm run audit:buttons`
- [ ] Release gate, when release-sensitive: `./up-and-test.sh`

Commands run:

```text

```

Skipped checks and reason:

```text

```

## Risk and Rollback

- Risk:
- Rollback:

## Checklist

- [ ] I updated documentation or templates affected by this change.
- [ ] I updated `RELEASE_TEST_MATRIX.md` if routes, API groups, workflows, or release-gate responsibilities changed.
- [ ] I added or updated tests for behavior changes, bug fixes, or meaningful refactors.
- [ ] I used mock providers for default local verification unless the change specifically targets real provider behavior.
- [ ] I did not commit secrets, `.env` files, local databases, uploaded assets, rendered outputs, or model files.
- [ ] I used synthetic, licensed, public-domain, or redacted files in test evidence and screenshots.
