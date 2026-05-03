const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const TARGET_URL = process.env.TARGET_URL || "http://127.0.0.1:5173";
const API_BASE = process.env.API_BASE || "http://127.0.0.1:8000/api/v1";
const REPO_ROOT = process.env.REPO_ROOT || path.resolve(__dirname, "..");
const TEST_IMAGE = process.env.TEST_IMAGE;
const SOURCE_LANGUAGE = process.env.SOURCE_LANGUAGE || "ko";
const HEADLESS = process.env.HEADLESS !== "false";
const EVIDENCE_DIR = path.join(REPO_ROOT, "testing", "ui-e2e-opus-mt");
const REPORT_PATH = path.join(EVIDENCE_DIR, "report.md");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForText(page, text, timeout = 120000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
}

async function screenshot(page, name) {
  const target = path.join(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

async function waitForRegions(page, pageId, predicate, timeout = 30000) {
  const started = Date.now();
  let lastRegions = [];
  while (Date.now() - started < timeout) {
    const response = await page.request.get(`${API_BASE}/pages/${pageId}/regions`);
    assert(response.ok(), `Regions API failed: ${response.status()}`);
    lastRegions = await response.json();
    if (predicate(lastRegions)) {
      return lastRegions;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Timed out waiting for expected regions state. Last count: ${lastRegions.length}`);
}

(async () => {
  assert(TEST_IMAGE, "Set TEST_IMAGE to a local manga/comic image before running real-provider E2E.");
  assert(fs.existsSync(TEST_IMAGE), `TEST_IMAGE does not exist: ${TEST_IMAGE}`);

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const events = [];
  const consoleErrors = [];
  const pageErrors = [];
  const screenshots = [];
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 75 });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(120000);
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.stack || error.message);
  });

  try {
    await page.goto(TARGET_URL, { waitUntil: "networkidle" });
    await waitForText(page, "Drag and drop comic pages here");
    screenshots.push(await screenshot(page, "01-landing"));
    events.push("Loaded landing upload screen.");

    await page.setInputFiles("input[type='file']", TEST_IMAGE);
    await page.waitForURL("**/projects/new", { timeout: 30000 });
    await waitForText(page, "Translation settings");
    screenshots.push(await screenshot(page, "02-project-setup"));
    events.push("Uploaded Korean screenshot and reached project setup.");

    await page.locator("input").first().fill("UI E2E OPUS MT");
    await page
      .locator("textarea")
      .first()
      .fill("Browser E2E using Tesseract OCR and local OPUS-MT.");
    const sourceLanguageSelect = page.locator("select").first();
    if (await sourceLanguageSelect.isEnabled()) {
      await sourceLanguageSelect.selectOption(SOURCE_LANGUAGE);
    } else {
      const lockedSourceLanguage = await sourceLanguageSelect.inputValue();
      assert(
        lockedSourceLanguage === SOURCE_LANGUAGE,
        `Expected locked source language ${SOURCE_LANGUAGE}, got ${lockedSourceLanguage}`,
      );
    }
    await page.getByRole("button", { name: /Start AI Processing/i }).click();
    events.push("Started processing from setup form.");

    await page.waitForURL(/\/projects\/[^/]+\/processing$/, { timeout: 120000 });
    await waitForText(page, "Review flagged regions", 120000);
    screenshots.push(await screenshot(page, "03-processing-complete"));
    const projectId = page.url().match(/\/projects\/([^/]+)\/processing/)?.[1];
    assert(projectId, `Could not parse project id from ${page.url()}`);
    events.push(`Processing completed for project ${projectId}.`);

    const projectResponse = await page.request.get(`${API_BASE}/projects/${projectId}`);
    assert(projectResponse.ok(), `Project API failed: ${projectResponse.status()}`);
    const project = await projectResponse.json();
    assert(
      ["review_required", "completed"].includes(project.status),
      `Unexpected project status after processing: ${project.status}`,
    );

    const pagesResponse = await page.request.get(`${API_BASE}/projects/${projectId}/pages`);
    assert(pagesResponse.ok(), `Pages API failed: ${pagesResponse.status()}`);
    const pages = await pagesResponse.json();
    assert(pages.length === 1, `Expected 1 page, got ${pages.length}`);
    assert(
      ["review_required", "completed"].includes(pages[0].status),
      `Unexpected page status: ${pages[0].status}`,
    );

    const regionsResponse = await page.request.get(`${API_BASE}/pages/${pages[0].id}/regions`);
    assert(regionsResponse.ok(), `Regions API failed: ${regionsResponse.status()}`);
    const regions = await regionsResponse.json();
    assert(regions.length > 0, "Expected at least one OCR region.");
    const translatedRegion = regions.find((region) => region.translated_text);
    assert(translatedRegion, "Expected at least one translated OCR region.");
    assert(
      !translatedRegion.translated_text.startsWith("[en]"),
      `Translation still looks mocked: ${translatedRegion.translated_text}`,
    );
    events.push(
      `Detected ${regions.length} region(s); sample "${translatedRegion.detected_text}" -> "${translatedRegion.translated_text}".`,
    );

    await page.getByRole("link", { name: /Review flagged regions/i }).click();
    await page.waitForURL(`**/projects/${projectId}/review`, { timeout: 30000 });
    await waitForText(page, "Quality Review Mode");
    screenshots.push(await screenshot(page, "04-review"));
    events.push("Review screen loaded.");

    await page.getByRole("link", { name: /Open Editor/i }).click();
    await page.waitForURL(`**/projects/${projectId}/editor`, { timeout: 30000 });
    await waitForText(page, "regions", 30000);
    screenshots.push(await screenshot(page, "05-editor"));
    events.push("Editor screen loaded with region count.");

    const regionBox = page.locator('[title^="Region "]').first();
    const initialRegionBox = translatedRegion.bounding_box;
    const regionBounds = await regionBox.boundingBox();
    assert(regionBounds, "Could not locate rendered region box for dragging.");
    await page.mouse.move(
      regionBounds.x + regionBounds.width / 2,
      regionBounds.y + regionBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      regionBounds.x + regionBounds.width / 2 + 90,
      regionBounds.y + regionBounds.height / 2 + 70,
      { steps: 8 },
    );
    await page.mouse.up();
    const movedRegions = await waitForRegions(
      page,
      pages[0].id,
      (items) => {
        const movedRegion = items.find((region) => region.id === translatedRegion.id);
        return (
          movedRegion &&
          (movedRegion.bounding_box.x !== initialRegionBox.x ||
            movedRegion.bounding_box.y !== initialRegionBox.y)
        );
      },
      30000,
    );
    const movedRegion = movedRegions.find((region) => region.id === translatedRegion.id);
    assert(movedRegion, "Moved region disappeared unexpectedly.");
    events.push(
      `Moved region from ${initialRegionBox.x},${initialRegionBox.y} to ${movedRegion.bounding_box.x},${movedRegion.bounding_box.y}.`,
    );

    await page.getByRole("button", { name: /Reject/i }).last().click();
    const expectedAfterReject = regions.length - 1;
    const deletedRegions = await waitForRegions(
      page,
      pages[0].id,
      (items) =>
        items.length === expectedAfterReject &&
        !items.some((region) => region.id === translatedRegion.id),
      30000,
    );
    await waitForText(page, `${expectedAfterReject} detected regions`, 30000);
    screenshots.push(await screenshot(page, "06-region-rejected"));
    events.push(
      `Rejected/deleted one detected region; ${deletedRegions.length} region(s) remain.`,
    );

    await page.getByRole("link", { name: /^Export$/i }).click();
    await page.waitForURL(`**/projects/${projectId}/export`, { timeout: 30000 });
    await waitForText(page, "Format Selection");
    screenshots.push(await screenshot(page, "07-export"));
    events.push("Export screen loaded.");

    await page.locator("input").first().fill("ui-e2e-opus-mt");
    await page.getByRole("button", { name: /^Export Project$/i }).click();
    await waitForText(page, "Download export", 120000);
    screenshots.push(await screenshot(page, "08-export-ready"));
    events.push("Export Project button created an export and the download link appeared.");

    const report = [
      "# UI E2E: Tesseract + OPUS-MT",
      "",
      `Run time: ${new Date().toISOString()}`,
      `Frontend: ${TARGET_URL}`,
      `Backend API: ${API_BASE}`,
      `Test image: ${TEST_IMAGE}`,
      `Source language: ${SOURCE_LANGUAGE}`,
      "",
      "## Result",
      "",
      "PASS",
      "",
      "## Events",
      "",
      ...events.map((event) => `- ${event}`),
      "",
      "## API Assertions",
      "",
      `- Project status: ${project.status}`,
      `- Page status: ${pages[0].status}`,
      `- OCR regions before reject: ${regions.length}`,
      `- OCR regions after reject: ${deletedRegions.length}`,
      `- Sample detected text: ${translatedRegion.detected_text}`,
      `- Sample translated text: ${translatedRegion.translated_text}`,
      "",
      "## Screenshots",
      "",
      ...screenshots.map((file) => `- ${path.relative(REPO_ROOT, file)}`),
      "",
      "## Browser Errors",
      "",
      consoleErrors.length || pageErrors.length
        ? [...consoleErrors, ...pageErrors].map((item) => `- ${item}`).join("\n")
        : "None observed.",
      "",
    ].join("\n");
    fs.writeFileSync(REPORT_PATH, report, "utf8");
    console.log(`PASS ${REPORT_PATH}`);
  } catch (error) {
    screenshots.push(await screenshot(page, "failure"));
    const report = [
      "# UI E2E: Tesseract + OPUS-MT",
      "",
      `Run time: ${new Date().toISOString()}`,
      "",
      "## Result",
      "",
      "FAIL",
      "",
      "## Error",
      "",
      "```",
      error.stack || error.message,
      "```",
      "",
      "## Events",
      "",
      ...events.map((event) => `- ${event}`),
      "",
      "## Browser Errors",
      "",
      consoleErrors.length || pageErrors.length
        ? [...consoleErrors, ...pageErrors].map((item) => `- ${item}`).join("\n")
        : "None observed.",
      "",
      "## Screenshots",
      "",
      ...screenshots.map((file) => `- ${path.relative(REPO_ROOT, file)}`),
      "",
    ].join("\n");
    fs.writeFileSync(REPORT_PATH, report, "utf8");
    console.error(`FAIL ${REPORT_PATH}`);
    throw error;
  } finally {
    await browser.close();
  }
})();
