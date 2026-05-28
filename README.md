# ImageTranslator

[![CI](https://github.com/SyedBaqarAbbas/ImageTranslator/actions/workflows/ci.yml/badge.svg)](https://github.com/SyedBaqarAbbas/ImageTranslator/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SyedBaqarAbbas/ImageTranslator/actions/workflows/codeql.yml/badge.svg)](https://github.com/SyedBaqarAbbas/ImageTranslator/actions/workflows/codeql.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

ImageTranslator is a full-stack manga/comic translation workflow. You can upload pages, run OCR + translation, review/edit text regions, render outputs, and export results.

## Documentation

- Deployed app: <http://158.101.11.4:5173>
- Published docs: <https://syedbaqarabbas.github.io/ImageTranslator/>
- In-repo docs entrypoint: [docs/index.md](docs/index.md)

## Quick Start

Pick one setup path:

1. Docker (full app with Docker-managed services)
2. `start-local-prototype.sh` (host-run backend/frontend with local data + provider controls)

For step-by-step commands and environment variable details, use [run-guide.md](run-guide.md).

### Option 1: Docker

If OPUS-MT models are not prepared yet, do that once first:

```bash
cd backend
./scripts/setup_opus_mt_models.sh
cd ..
```

```bash
docker compose up --build
```

Open:

- App: `http://localhost:5173`
- API health: `http://localhost:8000/api/v1/health`
- API docs: `http://localhost:8000/docs`

Stop:

```bash
docker compose down
```

### Option 2: Local Prototype Script

```bash
./start-local-prototype.sh
```

Open:

- App: `http://127.0.0.1:5173`
- API health: `http://127.0.0.1:8000/api/v1/health`

Stop with `Ctrl-C`.

## Local Defaults

- Both the Docker and script paths default to `OCR_PROVIDER=tesseract` and `TRANSLATION_PROVIDER=opus_mt`.
- No external provider API keys are needed for default local runs.

## Real Local Models

The default backend path uses local Tesseract OCR and local OPUS-MT translation. Tesseract is installed inside the Docker backend image. OPUS-MT model files are ignored by git, so prepare them once before processing pages with the default translation provider:

```bash
cd backend
./scripts/setup_opus_mt_models.sh
cd ..
```

For deterministic mock runs, override both backend providers:

```bash
OCR_PROVIDER=mock TRANSLATION_PROVIDER=mock docker compose up --build
OCR_PROVIDER=mock TRANSLATION_PROVIDER=mock ./start-local-prototype.sh
```

## Project Layout

```text
backend/    FastAPI API, DB models/migrations, providers, services, tests
frontend/   Vite + React app, routes, API adapters, tests
testing/    Generated local test evidence (gitignored)
```

## Testing

Use the release gate from repo root:

```bash
./up-and-test.sh
```

This runs backend/frontend coverage checks, Playwright route/workflow tests, button audits, and mock full-stack E2E.

## Contributing

Contributions are welcome. Read the [contributing guide](CONTRIBUTING.md) before starting work.

- Join the project workspace on Linear: [Linear invite link](https://linear.app/imagetranslator/join/04b6855f48853e2a06da14596e999f09?s=5)
- Browse or open GitHub issues: [Issues](https://github.com/SyedBaqarAbbas/ImageTranslator/issues)

Use Linear for planned project work and GitHub Issues for public bug reports or feature suggestions.

## More Docs

- Documentation site source: [docs/](docs/)
- Deployment operations: [docs/deployment.md](docs/deployment.md)
- Release notes: <https://syedbaqarabbas.github.io/ImageTranslator/release-notes/>
- Setup details: [run-guide.md](run-guide.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Support: [SUPPORT.md](SUPPORT.md)
- Security: [SECURITY.md](SECURITY.md)
