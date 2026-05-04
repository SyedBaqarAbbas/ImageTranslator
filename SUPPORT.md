# Support

ImageTranslator is currently a prototype. Support is best-effort and focused on
local development, reproducible bugs, documentation gaps, and the current
mock-provider workflow.

## Before Asking for Help

Check these docs first:

- [README.md](README.md) for the product flow, Docker setup, provider behavior,
  and smoke-test examples.
- [backend/README.md](backend/README.md) for backend setup, API behavior,
  migrations, services, and tests.
- [frontend/README.md](frontend/README.md) for frontend setup, mock versus HTTP
  API modes, scripts, and browser tests.
- [RELEASE_TEST_MATRIX.md](RELEASE_TEST_MATRIX.md) for release-gate coverage and
  route/API test expectations.
- [SECURITY.md](SECURITY.md) for vulnerability reporting and provider data
  handling.

## Where to Ask

- Use GitHub issues for reproducible bugs, feature requests, documentation
  fixes, and local setup problems.
- Use Linear for internal project-tracked work when you already have access to
  the ImageTranslator Linear workspace.
- Use GitHub private vulnerability reporting for security issues. Do not post
  exploit details, secrets, private files, or sensitive media in public issues.

Include enough detail to reproduce the problem: operating system, Docker or
local setup, backend/frontend command output, provider settings, browser URL,
expected behavior, actual behavior, and synthetic or redacted test files when
files are needed.

## Prototype Limitations

- The default OCR and translation providers are mocks. They are designed for
  deterministic local development, not production translation quality.
- Tesseract, EasyOCR, and OPUS-MT paths are optional prototype integrations with
  extra local dependencies and model setup.
- The local workflow uses a shared public workspace user and does not provide
  production auth or multi-workspace permissions.
- Hosted deployments should not be used with copyrighted, private,
  confidential, or sensitive manga/comic pages unless you are authorized to
  process that content.
