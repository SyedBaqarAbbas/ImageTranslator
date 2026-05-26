# Troubleshooting

## The App Does Not Start

Check that dependencies are installed:

```bash
cd frontend
npm install
cd ..
```

```bash
cd backend
conda run -n imagetranslator python -m pip install -e ".[dev,ocr]"
conda run -n imagetranslator python -m pip install -e ".[dev,local-ml]"
cd ..
```

If a port is busy, use overrides:

```bash
BACKEND_PORT=8010 FRONTEND_PORT=5174 ./start-local-prototype.sh
```

## Processing Fails Immediately

Common causes:

- no pages were uploaded
- uploaded file type is unsupported
- OPUS-MT model folders are missing
- Tesseract is missing
- Tesseract language data is missing
- provider env vars contain unsupported values

For a quick deterministic run without real providers:

```bash
OCR_PROVIDER=mock TRANSLATION_PROVIDER=mock ./start-local-prototype.sh
```

## OPUS-MT Model Missing Errors

Prepare models:

```bash
cd backend
./scripts/setup_opus_mt_models.sh
cd ..
```

Confirm the expected folders exist:

```text
backend/models/opus-mt/ko-en
backend/models/opus-mt/ja-en
```

## Tesseract Errors

On macOS:

```bash
brew install tesseract tesseract-lang
```

If Tesseract is installed in a non-default location, set:

```text
TESSERACT_CMD
TESSERACT_DATA_PATH
```

Use explicit language values such as `kor` or `jpn` when possible.

## Upload Problems

Use PNG, JPG/JPEG, WEBP, or ZIP archives for real backend HTTP mode.

PDF upload is only available in frontend mock mode at the moment. If you see PDF accepted in a UI demo, do not assume the backend HTTP upload route supports it.

## Export Says No Rendered Pages Are Available

Return to processing or the editor and make sure pages have completed OCR, translation, and rendering. Export uses rendered page assets, not only original uploads.

## Data Disappeared Between Runs

The local prototype stores state under:

```text
.local-data/
```

If you changed `LOCAL_PROTOTYPE_DATA_DIR`, check the script output for the resolved database and storage paths.

Docker data lives in Docker volumes. Running `docker compose down -v` removes disposable local volumes.

## GitHub Pages Does Not Publish

Check:

- GitHub Pages is enabled in repository settings
- Pages source is set to GitHub Actions
- `.github/workflows/docs.yml` ran on `main`
- `mkdocs build --strict` succeeds locally
- the workflow uploaded a Pages artifact and the deploy job had `pages: write` and `id-token: write`
