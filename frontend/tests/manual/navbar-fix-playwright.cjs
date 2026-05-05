const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const TARGET_URL = process.env.TARGET_URL || "http://127.0.0.1:5173";
const API_URL = process.env.API_URL || "http://127.0.0.1:8000/api/v1";
const HEADLESS = process.env.HEADLESS !== "false";
const REPO_ROOT = path.resolve(__dirname, "../../..");
const RESULTS_DIR = process.env.RESULTS_DIR || path.join(REPO_ROOT, "testing");
const artifactsDir = path.join(RESULTS_DIR, "artifacts");
const screenshotsDir = path.join(RESULTS_DIR, "screenshots");
const reportsDir = RESULTS_DIR;

fs.mkdirSync(artifactsDir, { recursive: true });
fs.mkdirSync(screenshotsDir, { recursive: true });

const results = {
  targetUrl: TARGET_URL,
  startedAt: new Date().toISOString(),
  checks: [],
  consoleErrors: [],
  failedRequests: [],
  pageErrors: [],
  createdProjectId: null,
};

function record(name, passed, details = {}) {
  results.checks.push({ name, passed, ...details });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
}

async function createProject(request) {
  const response = await request.post(`${API_URL}/projects`, {
    data: {
      name: `Navbar Fix ${Date.now()}`,
      description: "Project created by navbar regression audit",
      source_language: "ja",
      target_language: "en",
      translation_tone: "natural",
      replacement_mode: "replace",
      reading_direction: "rtl",
    },
  });
  if (!response.ok()) {
    throw new Error(`Could not create project: ${response.status()} ${await response.text()}`);
  }
  const project = await response.json();
  results.createdProjectId = project.id;
  return project;
}

async function expectPath(page, name, expectedPath) {
  const current = new URL(page.url());
  record(name, current.pathname === expectedPath, { url: page.url(), expectedPath });
}

async function clickTopNav(page, label, expectedPath) {
  await page.locator("header").getByRole("link", { name: label, exact: true }).click();
  await page.waitForURL((url) => url.pathname === expectedPath, { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  await expectPath(page, `Top nav ${label} routes to ${expectedPath}`, expectedPath);
  const heading = page.locator("main").getByRole("heading", { name: label, exact: true });
  const headingVisible = await heading.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false);
  record(`Top nav ${label} renders heading`, headingVisible);
}

function isExpectedRequestFailure(failure) {
  const url = failure.url || "";
  if (url.includes("/favicon") || url.startsWith("mailto:")) {
    return true;
  }
  return failure.failure === "net::ERR_ABORTED" && url.startsWith(API_URL);
}

(async () => {
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 40 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() === "error") {
      results.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    results.pageErrors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    results.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText ?? "unknown" });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      results.failedRequests.push({ url: response.url(), status: response.status() });
    }
  });

  const project = await createProject(context.request);

  await page.goto(`${TARGET_URL}/projects`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(screenshotsDir, "navbar-fixes-dashboard.png"), fullPage: true });
  record("Dashboard loads", await page.getByRole("heading", { name: "Projects" }).isVisible());
  record("Top nav Team link is absent", (await page.locator("header").getByRole("link", { name: "Team" }).count()) === 0);

  await clickTopNav(page, "Assets", "/assets");
  await clickTopNav(page, "Settings", "/settings");
  await clickTopNav(page, "Projects", "/projects");

  await page.goto(`${TARGET_URL}/team`);
  await page.waitForLoadState("networkidle");
  await expectPath(page, "Team route redirects to projects", "/projects");
  record(
    "Team management controls are not rendered",
    !(await page.getByRole("button", { name: /Draft invite/i }).isVisible().catch(() => false)),
  );

  const searchInput = page.getByPlaceholder("Search projects...").first();
  await searchInput.fill("Navbar Fix");
  await searchInput.press("Enter");
  await page.waitForLoadState("networkidle");
  const searchUrl = new URL(page.url());
  record("Top search navigates to project results", searchUrl.pathname === "/projects" && searchUrl.searchParams.get("search") === "Navbar Fix", {
    url: page.url(),
  });
  record("Dashboard search filters to created project", await page.getByText(project.name).isVisible().catch(() => false));

  await page.getByRole("button", { name: "Notifications" }).click();
  record("Notifications button opens popover", await page.getByText("No new workspace notifications.").isVisible().catch(() => false));

  await page.getByRole("button", { name: "Help" }).click();
  record("Help button opens menu", await page.getByText("Workspace settings").isVisible().catch(() => false));

  await page.getByRole("button", { name: "Share" }).click();
  await page.screenshot({ path: path.join(screenshotsDir, "navbar-fixes-share-popover.png"), fullPage: true });
  record("Share button shows coming soon", await page.getByText("Coming Soon").isVisible().catch(() => false));
  record("Share popover does not show URL input", (await page.locator('input[readonly]').count()) === 0);
  record("Share popover does not show legacy title", (await page.getByText("Share workspace").count()) === 0);

  await page.locator("header").getByRole("button", { name: "New project" }).click();
  await page.waitForLoadState("networkidle");
  await expectPath(page, "Top nav New Project opens landing upload", "/");

  await page.goto(`${TARGET_URL}/projects`);
  await page.waitForLoadState("networkidle");

  const editorLink = page.locator(`aside a[href="/projects/${project.id}/editor"]`);
  record("Sidebar Editor link points at a real project", (await editorLink.count()) > 0, { expectedProjectId: project.id });
  if ((await editorLink.count()) > 0) {
    await editorLink.first().click();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(screenshotsDir, "navbar-fixes-editor-route.png"), fullPage: true });
    await expectPath(page, "Sidebar Editor routes without hardcoded project-cyber", `/projects/${project.id}/editor`);
    record("Editor route does not show project not found", !(await page.getByText("Project not found").isVisible().catch(() => false)));
  }

  const sidebarRoutes = [
    ["Batch OCR", "/batch-ocr", true],
    ["Typefaces", "/typefaces", true],
    ["Archive", "/archive", true],
    ["Account", "/account", true],
    ["Support", "/support", false],
  ];

  for (const [label, expectedPath, shouldRoute] of sidebarRoutes) {
    await page.goto(`${TARGET_URL}/projects`);
    await page.waitForLoadState("networkidle");
    const link = page.locator(`aside a[href="${expectedPath}"]`).first();
    record(`Sidebar ${label} link exists`, (await link.count()) > 0);
    if ((await link.count()) > 0) {
      if (!shouldRoute) {
        record(`Sidebar ${label} link remains disabled`, (await link.getAttribute("aria-disabled")) === "true");
        continue;
      }
      await link.click();
      await page.waitForLoadState("networkidle");
      await expectPath(page, `Sidebar ${label} routes to ${expectedPath}`, expectedPath);
    }
  }

  const unexpectedFailures = results.failedRequests.filter((failure) => {
    return !isExpectedRequestFailure(failure);
  });
  record("No unexpected failed network requests", unexpectedFailures.length === 0, { unexpectedFailures });
  record("No console errors", results.consoleErrors.length === 0, { consoleErrors: results.consoleErrors });
  record("No page errors", results.pageErrors.length === 0, { pageErrors: results.pageErrors });

  results.finishedAt = new Date().toISOString();
  results.passed = results.checks.every((check) => check.passed);
  fs.writeFileSync(path.join(artifactsDir, "navbar-fix-results.json"), JSON.stringify(results, null, 2));

  const report = [
    "# Navbar Fix Verification",
    "",
    `Date: ${results.finishedAt}`,
    `Target: ${TARGET_URL}`,
    `Created project: ${project.id}`,
    "",
    "## Result",
    "",
    results.passed ? "PASS" : "FAIL",
    "",
    "## Checks",
    "",
    ...results.checks.map((check) => `- ${check.passed ? "PASS" : "FAIL"}: ${check.name}${check.url ? ` (${check.url})` : ""}`),
    "",
    "## Errors",
    "",
    `Console errors: ${results.consoleErrors.length}`,
    `Page errors: ${results.pageErrors.length}`,
    `Failed requests: ${unexpectedFailures.length}`,
    "",
    "## Screenshots",
    "",
    "- `testing/screenshots/navbar-fixes-dashboard.png`",
    "- `testing/screenshots/navbar-fixes-share-popover.png`",
    "- `testing/screenshots/navbar-fixes-editor-route.png`",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(reportsDir, "navbar-fix-verification.md"), report);

  await browser.close();
  if (!results.passed) {
    process.exitCode = 1;
  }
})();
