# ImageTranslator

[![CI](https://github.com/SyedBaqarAbbas/ImageTranslator/actions/workflows/ci.yml/badge.svg)](https://github.com/SyedBaqarAbbas/ImageTranslator/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SyedBaqarAbbas/ImageTranslator/actions/workflows/codeql.yml/badge.svg)](https://github.com/SyedBaqarAbbas/ImageTranslator/actions/workflows/codeql.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

ImageTranslator is a full-stack manga/comic translation workflow. You can upload pages, run OCR + translation, review/edit text regions, render outputs, and export results.

## Quick Start

Pick one setup path:

1. Docker (fastest start)
2. `start-local-prototype.sh` (host-run backend/frontend with local data + provider controls)

For step-by-step commands and environment variable details, use [run-guide.md](run-guide.md).

### Option 1: Docker

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

- Docker path defaults to `OCR_PROVIDER=mock` and `TRANSLATION_PROVIDER=mock`.
- Script path defaults to `OCR_PROVIDER=tesseract` and `TRANSLATION_PROVIDER=opus_mt`.
- No external provider API keys are needed for default local runs.

## Run Real Models (Exit Mock Mode)

If you are currently in mock mode, switch to local real models with:

```bash
cd backend
./scripts/setup_opus_mt_models.sh
cd ..
OCR_PROVIDER=tesseract TRANSLATION_PROVIDER=opus_mt OPUS_MT_MODEL_ROOT="$(pwd)/backend/models/opus-mt" ./start-local-prototype.sh
```

For Docker, use the real-model override flow in [run-guide.md](run-guide.md) (`docker-compose.real-models.yml` + `docker compose -f ... up`).

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

## More Docs

- Setup details: [run-guide.md](run-guide.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Support: [SUPPORT.md](SUPPORT.md)
- Security: [SECURITY.md](SECURITY.md)
