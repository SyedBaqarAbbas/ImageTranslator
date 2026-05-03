# Root E2E Scripts

Reusable end-to-end scripts live here so they are committed to git. Generated reports, screenshots, JSON results, and logs should be written under the ignored root `testing/` directory.

Run the OPUS-MT UI flow through the Playwright skill runner with an explicit local
test image:

```bash
export TEST_IMAGE="/path/to/local/test-image.png"
cp e2e/ui-e2e-opus-mt.js /tmp/playwright-test-image-translator-opus-mt.js
cd /Users/ekai/.codex/skills/playwright-skill
node run.js /tmp/playwright-test-image-translator-opus-mt.js
```
