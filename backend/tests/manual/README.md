# Manual Backend E2E Scripts

These scripts require a running backend and are intentionally not named `test_*.py`, so the normal backend pytest suite does not auto-run them.

Examples:

```bash
cd backend
conda run -n imagetranslator python tests/manual/e2e_local_pipeline_api.py http://127.0.0.1:8000 ko "[en]"
conda run -n imagetranslator python tests/manual/e2e_opus_missing_models.py
```

They write generated JSON and image evidence under the ignored root `testing/` directory.

## Korean Region-Detection Benchmark

The safe generated benchmark does not require private images or native
Tesseract:

```bash
cd backend
conda run -n imagetranslator python scripts/benchmark_korean_region_detection.py
```

For actual Korean manhwa evidence, keep source images outside the repository and
create a local-only fixture directory with a `manifest.json` file:

```json
{
  "fixtures": [
    {
      "name": "page-001",
      "image": "page-001.png",
      "regions": [
        {
          "bounding_box": { "x": 120, "y": 80, "width": 240, "height": 96 },
          "text": "안녕하세요"
        }
      ]
    }
  ]
}
```

Each annotated region is a sentence-level manual crop where OCR is expected to work. Include
examples where the automatic path misses, mis-bounds, fragments, merges, or
falsely detects a region. Run the real Tesseract comparison with:

```bash
cd backend
conda run -n imagetranslator python scripts/benchmark_korean_region_detection.py \
  --fixture-dir /absolute/path/to/korean-region-fixtures \
  --source-language ko
```

This mode requires `pytesseract`, the native Tesseract binary, and Korean
language data. The report compares the legacy full-page path, automatic Korean
block detection, and manual crops on identical pages. Do not commit private or
copyrighted fixtures.
