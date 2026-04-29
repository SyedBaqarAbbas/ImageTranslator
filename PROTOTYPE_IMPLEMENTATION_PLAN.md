# Prototype Implementation Plan

This plan is for future Codex agents working on the current prototype. Keep the scope practical:

- Do not add auth or multi-user workflow yet.
- Do not add a queue/worker architecture yet.
- Keep the app usable in one local backend process plus the frontend.
- Preserve the default mock OCR and mock translation providers unless explicitly asked to change defaults.
- Prefer small, testable slices over production architecture.

## Current State

### Working

- Frontend can run in mock mode with `VITE_API_MODE=mock`.
- Frontend can run against the backend with `VITE_API_MODE=http`.
- Backend upload, processing, review, editor, rendering, and export paths exist.
- Default backend providers are still:
  - `OCR_PROVIDER=mock`
  - `TRANSLATION_PROVIDER=mock`
- Real local OCR is available with:
  - `OCR_PROVIDER=tesseract`
  - Native Tesseract plus `jpn`/`kor` language data.
- Lightweight local translation provider code exists with:
  - `TRANSLATION_PROVIDER=opus_mt`
  - CTranslate2 int8 model loading from local disk.
- Existing Pillow renderer is wired into the processing flow.
- E2E tests showed:
  - Japanese Tesseract OCR works through the backend.
  - Korean Tesseract OCR works through the backend.
  - Frontend HTTP flow works against the Tesseract backend.
  - Missing OPUS-MT models now fail clearly and mark the current page failed.

### Still Mock or Stubbed

- Translation is still mock unless local OPUS-MT model directories are prepared.
- `TRANSLATION_PROVIDER=openai` and `TRANSLATION_PROVIDER=deepl` are stubs that raise `NotImplementedError`.
- Frontend default mode is still in-browser mock unless `VITE_API_MODE=http` is set.
- Workflow endpoints use a shared public workspace user.
- Celery eager mode is the default; no separate worker should be added during this prototype phase.

## Primary Goal

Make the local prototype path usable end to end:

```text
image
-> light preprocessing
-> Tesseract OCR
-> OPUS-MT translation through CTranslate2 int8
-> existing Pillow overlay renderer
```

The main remaining blocker is preparing local OPUS-MT model directories:

```text
backend/models/opus-mt/
  ja-en/
    model.bin
    config.json
    source.spm
    target.spm
  ko-en/
    model.bin
    config.json
    source.spm
    target.spm
```

## Phase 1: Local Model Preparation

Status: helper and setup script implemented. In this workspace, `ja-en` and `ko-en` have been downloaded and converted under ignored local model folders. Fresh clones still need to run the setup script.

Implemented local setup:

```bash
cd backend
./scripts/setup_opus_mt_models.sh
```

Lower-level helper commands:

```bash
conda run -n imagetranslator python scripts/prepare_opus_mt_models.py --check-only
conda run -n imagetranslator python scripts/prepare_opus_mt_models.py --dry-run
conda run -n imagetranslator python scripts/prepare_opus_mt_models.py --pairs ja-en ko-en
```

The helper:

- Checks whether `ja-en` and `ko-en` model directories exist.
- Validates required runtime files.
- Converts configured Hugging Face OPUS-MT models with `ct2-transformers-converter`.
- Uses int8 quantization by default.
- Copies `source.spm` and `target.spm`.
- Skips existing valid models unless `--force` is passed.
- Writes a local manifest under `backend/models/opus-mt/manifest.json`.
- Never runs from backend request handling.

Prototype acceptance:

- `python scripts/prepare_opus_mt_models.py --check-only` reports missing/present model files.
- `python scripts/prepare_opus_mt_models.py --dry-run` prints conversion commands without network/download.
- Runtime still fails clearly if models are missing.

## Phase 2: Real OPUS-MT Smoke Test

Blocked until model directories exist.

Once models are prepared:

1. Start backend:

   ```bash
   cd backend
   AUTO_CREATE_TABLES=true \
   DATABASE_URL=sqlite+aiosqlite:////tmp/image-translator-opus-smoke.db \
   LOCAL_STORAGE_PATH=/tmp/image-translator-opus-storage \
   PUBLIC_BASE_URL=http://localhost:8000 \
   OCR_PROVIDER=tesseract \
   TRANSLATION_PROVIDER=opus_mt \
   OPUS_MT_MODEL_ROOT=./models/opus-mt \
   conda run -n imagetranslator python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

2. Run API E2E for Japanese and Korean.
3. Confirm translated text is not mock-prefixed with `[en]`.
4. Save results under `testing/`.

Prototype acceptance:

- Japanese source text produces English text through `opus_mt`.
- Korean source text produces English text through `opus_mt`.
- The processing job succeeds and final PNG assets render.
- Memory use remains reasonable on a 16 GB MacBook.

## Phase 3: Small UX/Developer Readiness Improvements

Keep these simple:

- Add a backend startup/log note only if `TRANSLATION_PROVIDER=opus_mt` and required model dirs are missing.
- Add a small local smoke command to docs.
- Add clearer frontend error copy when processing fails because local model files are missing.
- Do not add account settings, admin screens, or provider management UI yet.

## Phase 4: OCR/Rendering Prototype Quality

Only after real OPUS-MT is working:

- Improve Tesseract preprocessing knobs for manga/manhwa scans.
- Add optional vertical-language Tesseract config experiments.
- Keep preprocessing local and fast.
- Improve the existing Pillow renderer only enough for readable prototype output.
- Do not add a second renderer unless the current renderer blocks basic usability.

## Deferred Until After Prototype

- Real auth and multi-user workspaces.
- Background queue/worker deployment.
- Hosted translation providers.
- Production OCR model selection.
- S3/CDN production storage.
- Fine-grained project permissions.
- Full observability/metrics.

## Current Known Backlog

- Repo-wide `ruff check app` still has legacy lint failures unrelated to the local pipeline work.
- `OpenAITranslationProvider` and `DeepLTranslationProvider` are stubs.
- OPUS-MT real translation E2E is blocked until model files are prepared.
- Existing tests cover provider selection and failure handling, but not real model translation.
