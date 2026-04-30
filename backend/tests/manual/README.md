# Manual Backend E2E Scripts

These scripts require a running backend and are intentionally not named `test_*.py`, so the normal backend pytest suite does not auto-run them.

Examples:

```bash
cd backend
conda run -n imagetranslator python tests/manual/e2e_local_pipeline_api.py http://127.0.0.1:8000 ko "[en]"
conda run -n imagetranslator python tests/manual/e2e_opus_missing_models.py
```

They write generated JSON and image evidence under the ignored root `testing/` directory.
