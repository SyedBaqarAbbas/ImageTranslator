# Root E2E Scripts

Reusable end-to-end scripts live here so they are committed to git. Generated reports, screenshots, JSON results, and logs should be written under the ignored root `testing/` directory.

Run the OPUS-MT UI flow through the Playwright skill runner:

```bash
cp e2e/ui-e2e-opus-mt.js /tmp/playwright-test-image-translator-opus-mt.js
cd /Users/ekai/.codex/skills/playwright-skill
node run.js /tmp/playwright-test-image-translator-opus-mt.js
```

The script defaults to the Korean screenshot at:

```bash
/Users/ekai/Desktop/Screenshot\ 2026-04-29\ at\ 11.42.59 PM.png
```
