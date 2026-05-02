const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const TARGET_URL = process.env.TARGET_URL || "http://localhost:5173";
const HEADLESS = process.env.HEADLESS !== "false";
const REPO_ROOT = path.resolve(__dirname, "../../..");
const RESULTS_DIR = process.env.RESULTS_DIR || path.join(REPO_ROOT, "testing");
const ARTIFACT_DIR = path.join(RESULTS_DIR, "artifacts");
const SCREENSHOT_DIR = path.join(RESULTS_DIR, "screenshots");

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = {
  started_at: new Date().toISOString(),
  target_url: TARGET_URL,
  top_nav: [],
  sidebar: [],
  observations: [],
};

function normalizeUrl(url) {
  return url.replace(TARGET_URL, "");
}

function sectionText(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function collectState(page) {
  const headings = await page
    .locator("h1, h2")
    .evaluateAll((elements) => elements.map((element) => element.textContent?.trim()).filter(Boolean));
  const bodyText = await page.locator("body").innerText().catch(() => "");
  return {
    url: normalizeUrl(page.url()),
    headings,
    body_excerpt: sectionText(bodyText),
  };
}

async function runAction(page, group, name, startPath, action) {
  const consoleMessages = [];
  const requestFailures = [];

  const onConsole = (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push({ type: message.type(), text: message.text() });
    }
  };
  const onRequestFailed = (request) => {
    requestFailures.push({ url: request.url(), failure: request.failure()?.errorText });
  };

  page.on("console", onConsole);
  page.on("requestfailed", onRequestFailed);

  const startUrl = `${TARGET_URL}${startPath}`;
  await page.goto(startUrl, { waitUntil: "networkidle" });
  const before = await collectState(page);

  let actionError = null;
  try {
    await action(page);
    await page.waitForTimeout(800);
  } catch (error) {
    actionError = error.message;
  }

  const after = await collectState(page);
  const item = {
    name,
    start_path: startPath,
    before,
    after,
    action_error: actionError,
    console_messages: consoleMessages,
    request_failures: requestFailures,
    changed_url: before.url !== after.url,
    changed_content: before.body_excerpt !== after.body_excerpt,
  };
  results[group].push(item);

  page.off("console", onConsole);
  page.off("requestfailed", onRequestFailed);
  console.log(`${group}: ${name} -> ${after.url}${actionError ? ` ERROR ${actionError}` : ""}`);
}

(async () => {
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await runAction(page, "top_nav", "Brand link", "/projects", async (page) => {
    await page.getByRole("link", { name: /ComicFlow AI/i }).click();
  });

  for (const label of ["Projects", "Assets", "Settings"]) {
    await runAction(page, "top_nav", `${label} nav link`, "/projects", async (page) => {
      await page.locator("header").getByRole("link", { name: label }).click();
    });
  }

  await runAction(page, "top_nav", "Top search field", "/projects", async (page) => {
    const search = page.locator("header input[placeholder='Search projects...']");
    await search.fill("Usability Basic");
    await search.press("Enter");
  });

  await runAction(page, "top_nav", "Notifications button", "/projects", async (page) => {
    await page.getByRole("button", { name: "Notifications" }).click();
  });

  await runAction(page, "top_nav", "Help button", "/projects", async (page) => {
    await page.getByRole("button", { name: "Help" }).click();
  });

  await runAction(page, "top_nav", "Share button", "/projects", async (page) => {
    await page.getByRole("button", { name: /Share/i }).click();
  });

  await runAction(page, "top_nav", "New Project button", "/projects", async (page) => {
    await page.locator("header").getByRole("button", { name: "New project" }).click();
  });

  await page.goto(`${TARGET_URL}/projects`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "navbar-dashboard-baseline.png"), fullPage: true });

  for (const label of ["Dashboard", "Editor", "Batch OCR", "Typefaces", "Archive"]) {
    await runAction(page, "sidebar", `${label} sidebar nav`, "/projects", async (page) => {
      await page.getByRole("link", { name: label }).click();
    });
  }

  await runAction(page, "sidebar", "Sidebar New Project button", "/projects", async (page) => {
    await page.locator("aside").getByRole("button", { name: /New Project/i }).click();
  });

  await runAction(page, "sidebar", "Account link", "/projects", async (page) => {
    await page.getByRole("link", { name: "Account" }).click();
  });

  await page.goto(`${TARGET_URL}/projects`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "navbar-after-audit.png"), fullPage: true });

  results.completed_at = new Date().toISOString();
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, "navbar-audit-results.json"),
    JSON.stringify(results, null, 2),
  );
  await browser.close();
})();
