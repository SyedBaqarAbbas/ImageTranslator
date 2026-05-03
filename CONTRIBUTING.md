# Contributing to ImageTranslator

Thanks for taking the time to contribute. ImageTranslator is a public prototype
for manga, manhwa, and comic page translation workflows, so changes should keep
the local mock-first workflow stable and easy to verify.

## Before You Start

- Read the root [README.md](README.md), [backend/README.md](backend/README.md),
  [frontend/README.md](frontend/README.md), and
  [RELEASE_TEST_MATRIX.md](RELEASE_TEST_MATRIX.md) for the current workflow and
  release-gate expectations.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Open or link an issue before broad changes. Internal project work should link
  the Linear issue ID, for example `IMA-32`; external contributors can use
  GitHub issues.
- Do not commit secrets, `.env` files, local databases, uploaded images,
  rendered outputs, model files, provider keys, or production configuration.
- Use synthetic, licensed, public-domain, or redacted images in issues, tests,
  and screenshots.

## Local Setup

The fastest full-stack setup is Docker Compose from the repository root:

```bash
docker compose up --build
```

This starts the frontend at `http://localhost:5173`, the API at
`http://localhost:8000`, PostgreSQL, and one-shot migrations. The local defaults
use mock OCR and mock translation providers, so external AI keys are not
required for basic development or smoke testing.

Backend-only setup uses Python 3.11. The maintainer workflow uses the
`imagetranslator` conda environment:

```bash
cd backend
conda create -n imagetranslator python=3.11 -y
conda activate imagetranslator
python -m pip install -e ".[dev,ocr]"
python -m pip install -e ".[dev,local-ml]"
```

Frontend-only setup:

```bash
cd frontend
npm install
npm run dev
```

The frontend defaults to `VITE_API_MODE=mock`, which runs entirely in browser
memory. To test against the backend API instead:

```bash
VITE_API_MODE=http VITE_API_BASE_URL=http://localhost:8000/api/v1 npm run dev
```

## Provider Behavior

- `OCR_PROVIDER=mock` and `TRANSLATION_PROVIDER=mock` are the default local
  providers and are the expected path for fast deterministic tests.
- `OCR_PROVIDER=tesseract` and `TRANSLATION_PROVIDER=opus_mt` are opt-in local
  prototype providers. They require native/model setup and process files on the
  developer machine.
- `OCR_PROVIDER=easyocr` is available when optional OCR dependencies are
  installed and may download EasyOCR model files on first real use.
- `TRANSLATION_PROVIDER=openai` and `TRANSLATION_PROVIDER=deepl` currently
  select provider stubs that raise `NotImplementedError`; do not enable them
  unless the provider implementation is part of the change.

Do not upload copyrighted, private, confidential, or sensitive manga/comic pages
to hosted deployments unless you are authorized to process that content. Future
real provider integrations may send content, extracted text, prompts, metadata,
or generated outputs to third-party APIs.

## Branches and Commits

Use short descriptive branch names that include the issue ID when one exists:

```text
ima-32-community-standards
fix-upload-validation
docs-provider-setup
```

Commit messages should use a bracketed prefix:

```text
[docs] add contributor guide
[fix] handle empty OCR results
[tests] cover export download failures
[ai-ops] update agent workflow guidance
```

Use `[ai-ops]` for changes to agent workflow files such as `AGENTS.md` or
`SKILL.md`.

## Testing Expectations

Add or update tests for behavior changes, bug fixes, and meaningful refactors.
Run focused tests first, then broader suites based on the area touched.

Backend commands from `backend/`:

```bash
conda run -n imagetranslator pytest -q --cov=app --cov-report=term-missing:skip-covered
conda run -n imagetranslator python -m compileall app migrations
conda run -n imagetranslator ruff check <changed-python-files>
```

Frontend commands from `frontend/`:

```bash
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npm run test:e2e
npm run audit:buttons
```

Run the root release gate before release-sensitive merges:

```bash
./up-and-test.sh
```

The release gate is broader than GitHub CI. It covers backend pytest and
compile, frontend typecheck/lint/Vitest/build, Playwright smoke and route tests,
button and navbar audits, mock full-stack E2E, OPUS-MT missing-model failure
checks, and optional real-provider E2E when explicitly enabled.

Tests should assert business outcomes, not just successful commands: persisted
state, API calls, job status, generated assets or downloads, routed navigation,
validation errors, failure messages, and user-visible feedback.

## Pull Requests

Pull requests should include:

- A concise summary of the user-facing or developer-facing change.
- Linked GitHub and/or Linear issues.
- Screenshots or recordings for visible UI changes.
- Test evidence with exact commands run, or a clear explanation for skipped
  checks.
- Risk and rollback notes for migrations, provider behavior, generated assets,
  workflows, or release-gate changes.
- Updates to docs, issue templates, release matrix, or button audit manifests
  when the behavior they describe changes.

Keep pull requests focused. Avoid mixing unrelated refactors with feature or bug
fix work.
