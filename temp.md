# Full Local Verification Commands

Run from `/Users/ekai/Documents/personal/personal_projects/ImageTranslator` unless a command changes directory.

## One-Command Local Startup

```bash
./start-local-prototype.sh
```

This starts the backend and frontend together with the local prototype defaults:

- Backend: `http://127.0.0.1:8000`
- Frontend: `http://127.0.0.1:5173`
- OCR: `OCR_PROVIDER=tesseract`
- Translation: `TRANSLATION_PROVIDER=opus_mt`
- Models: `backend/models/opus-mt`

Stop both servers with `Ctrl-C`.

Useful overrides:

```bash
OCR_PROVIDER=mock TRANSLATION_PROVIDER=mock ./start-local-prototype.sh
```

```bash
BACKEND_PORT=8010 FRONTEND_PORT=5174 ./start-local-prototype.sh
```

## Backend Checks

```bash
cd backend
conda run -n imagetranslator python scripts/prepare_opus_mt_models.py --check-only
```

Expected result: `ja-en` and `ko-en` both report `ready`.

```bash
cd backend
conda run -n imagetranslator python -c "import asyncio; from app.providers.translation import OpusMTTranslationProvider; results = asyncio.run(OpusMTTranslationProvider().translate_many(['こんにちは', '안녕하세요'], source_language='auto', target_language='en')); print([(r.detected_language, r.translated_text) for r in results])"
```

Expected result from the current local models: `[('ja', 'Hello.'), ('ko', 'Hello.')]`.

```bash
cd backend
conda run -n imagetranslator pytest -q
```

Latest result: `26 passed, 1 warning`.

```bash
cd backend
conda run -n imagetranslator ruff check app/core/config.py app/providers/ocr.py app/tests/test_local_ml_providers.py scripts/prepare_opus_mt_models.py
```

Latest result: passed.

```bash
cd backend
conda run -n imagetranslator python -m compileall app migrations scripts
```

Latest result: passed.

## Frontend Checks

```bash
cd frontend
npm run typecheck
```

Latest result: passed.

```bash
cd frontend
npm run test
```

Latest result: `6 passed`.

```bash
cd frontend
npm run lint
```

Latest result: passed.

```bash
cd frontend
npm run build
```

Latest result: passed.

```bash
cd frontend
npm run test:e2e
```

Latest result: `3 passed`.

## Real UI E2E: Tesseract + OPUS-MT

The browser E2E now defaults to the real Korean screenshot:

```bash
/Users/ekai/Desktop/Screenshot\ 2026-04-29\ at\ 11.42.59 PM.png
```

Optional: generate a simple Japanese PNG if you want a synthetic fallback fixture:

```bash
cd backend
conda run -n imagetranslator python -c "from PIL import Image, ImageDraw, ImageFont; img=Image.new('RGB',(900,620),'white'); draw=ImageDraw.Draw(img); font=ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc',96); draw.rounded_rectangle((120,150,780,430), radius=50, outline='black', width=8, fill='white'); draw.text((230,245),'こんにちは', font=font, fill='black'); img.save('/private/tmp/image-translator-ui-e2e-ja.png')"
```

Optional Korean OCR sanity check on the real screenshot:

```bash
tesseract "/Users/ekai/Desktop/Screenshot 2026-04-29 at 11.42.59 PM.png" stdout -l kor --psm 6
```

Expected result includes `저 사람이`, `소냐를 마지막으로`, and `봤대!`.

Start the backend in one terminal:

```bash
cd backend
AUTO_CREATE_TABLES=true DATABASE_URL=sqlite+aiosqlite:////tmp/image-translator-ui-e2e.db LOCAL_STORAGE_PATH=/tmp/image-translator-ui-e2e-storage PUBLIC_BASE_URL=http://127.0.0.1:8000 OCR_PROVIDER=tesseract TRANSLATION_PROVIDER=opus_mt TESSERACT_DEFAULT_LANGUAGE=kor TESSERACT_PSM=6 OPUS_MT_MODEL_ROOT=/Users/ekai/Documents/personal/personal_projects/ImageTranslator/backend/models/opus-mt conda run -n imagetranslator python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Start the frontend in a second terminal:

```bash
cd frontend
VITE_API_MODE=http VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1 npm run dev -- --host 127.0.0.1 --port 5173
```

Confirm both servers are reachable:

```bash
curl -sS http://127.0.0.1:8000/api/v1/health
```

```bash
curl -sS -I http://127.0.0.1:5173/
```

Run the browser E2E script:

```bash
cp scripts/ui-e2e-opus-mt.js /tmp/playwright-test-image-translator-opus-mt.js
cd /Users/ekai/.codex/skills/playwright-skill
node run.js /tmp/playwright-test-image-translator-opus-mt.js
```

Latest result: pass. Report and screenshots are written under `testing/ui-e2e-opus-mt/`.

Stop the backend and frontend with `Ctrl-C` in their terminals.

## Setup Commands If Models Are Missing

```bash
cd backend
./scripts/setup_opus_mt_models.sh
```

This downloads/converts OPUS-MT model files into `backend/models/opus-mt/`. Those files are intentionally ignored by git.
