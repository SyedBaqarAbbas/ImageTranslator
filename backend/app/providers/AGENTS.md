# AGENTS.md

Provider-specific guidance. Also follow `backend/AGENTS.md` and the root `AGENTS.md`.

## Current Providers

- Default OCR is mock OCR. It creates one synthetic text region near the top of each image with `Sample detected text`.
- Default translation is mock translation. It returns `[target_language] source text`.
- `RENDER_ENGINE=pillow` is the implemented renderer.

## OCR

- `OCR_PROVIDER=easyocr` uses real EasyOCR text detection/recognition and requires optional OCR dependencies.
- EasyOCR creates/downloads model files under `~/.EasyOCR` on first actual OCR use.
- A real smoke test has successfully read `HELLO 123` from a generated image with `OCR_PROVIDER=easyocr`.
- `OCR_PROVIDER=tesseract` is an opt-in local prototype provider using native Tesseract through `pytesseract`.
- Tesseract requires the native binary plus Korean/Japanese language data; prefer explicit `kor` or `jpn` source languages for speed.

## Translation

- `TRANSLATION_PROVIDER=opus_mt` is an opt-in local prototype provider using local pre-converted CTranslate2 OPUS-MT int8 models.
- OPUS-MT model directories live under `backend/models/opus-mt/` by default, are ignored by git, and must be prepared outside backend startup/request handling.
- Use `backend/scripts/setup_opus_mt_models.sh` to install conversion-only dependencies and prepare local OPUS-MT model folders.
- The Tesseract/OPUS-MT local prototype path must not add PyTorch.
- `TRANSLATION_PROVIDER=openai` and `TRANSLATION_PROVIDER=deepl` currently select stubs that raise `NotImplementedError`; do not claim real OpenAI/DeepL translation works until those providers are implemented.

## Local EasyOCR Mode

Run from `backend/`:

```bash
AUTO_CREATE_TABLES=true \
DATABASE_URL=sqlite+aiosqlite:////tmp/image-translator-dev.db \
LOCAL_STORAGE_PATH=/tmp/image-translator-storage \
PUBLIC_BASE_URL=http://localhost:8000 \
OCR_PROVIDER=easyocr \
TRANSLATION_PROVIDER=mock \
conda run -n imagetranslator python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
