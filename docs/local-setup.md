# Local Setup

Use local setup when you want backend and frontend processes running directly on your machine.

## Prerequisites

- Node.js 24 LTS and npm
- Conda
- Python 3.11 conda environment named `imagetranslator`
- Tesseract and language data for real OCR
- OPUS-MT model folders for real translation

## Backend Environment

Create and populate the backend conda environment:

```bash
cd backend
conda create -n imagetranslator python=3.11 -y
conda run -n imagetranslator python -m pip install -e ".[dev,ocr]"
conda run -n imagetranslator python -m pip install -e ".[dev,local-ml]"
cd ..
```

Prepare OPUS-MT model folders:

```bash
cd backend
./scripts/setup_opus_mt_models.sh
cd ..
```

The default host model root is:

```text
backend/models/opus-mt/
```

Expected default model folders:

```text
backend/models/opus-mt/ko-en
backend/models/opus-mt/ja-en
```

## Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

## Start Both Servers

From the repository root:

```bash
./start-local-prototype.sh
```

The script prints the resolved backend URL, frontend URL, database path, storage path, and provider values. By default it uses:

| Variable | Default |
| --- | --- |
| `BACKEND_HOST` | `127.0.0.1` |
| `BACKEND_PORT` | `8000` |
| `FRONTEND_HOST` | `127.0.0.1` |
| `FRONTEND_PORT` | `5173` |
| `LOCAL_PROTOTYPE_DATA_DIR` | `<repo>/.local-data` |
| `DATABASE_URL` | `sqlite+aiosqlite:///<repo>/.local-data/image-translator-local-prototype.db` |
| `LOCAL_STORAGE_PATH` | `<repo>/.local-data/storage` |
| `OCR_PROVIDER` | `tesseract` |
| `TRANSLATION_PROVIDER` | `opus_mt` |
| `OPUS_MT_MODEL_ROOT` | `<repo>/backend/models/opus-mt` |
| `VITE_API_MODE` | `http` |
| `VITE_API_BASE_URL` | `http://$BACKEND_HOST:$BACKEND_PORT/api/v1` |

## Useful Overrides

Run deterministic mock providers:

```bash
OCR_PROVIDER=mock TRANSLATION_PROVIDER=mock ./start-local-prototype.sh
```

Use custom ports:

```bash
BACKEND_PORT=8010 FRONTEND_PORT=5174 ./start-local-prototype.sh
```

Use a custom data directory:

```bash
LOCAL_PROTOTYPE_DATA_DIR=/tmp/image-translator-local ./start-local-prototype.sh
```

Run real providers explicitly:

```bash
OCR_PROVIDER=tesseract TRANSLATION_PROVIDER=opus_mt OPUS_MT_MODEL_ROOT="$(pwd)/backend/models/opus-mt" ./start-local-prototype.sh
```

## Safe Environment Variable Rules

Do:

- keep `.env` files local and out of git
- use placeholder values in docs and examples
- store generated databases, storage, model files, and uploads outside committed paths

Do not:

- commit secrets, private tokens, local databases, model folders, uploads, or rendered outputs
- paste real S3 credentials into issues or docs

## Validation Commands

Backend:

```bash
cd backend
conda run -n imagetranslator pytest -q --cov=app --cov-report=term-missing:skip-covered
conda run -n imagetranslator python -m compileall app migrations
```

Frontend:

```bash
cd frontend
npm run typecheck
npm run lint
npm run test:coverage
npm run build
```

Full release gate:

```bash
./up-and-test.sh
```
