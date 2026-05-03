const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { chromium } = require("playwright");

const TARGET_URL = process.env.TARGET_URL || "http://127.0.0.1:5173";
const API_URL = process.env.API_URL || "http://127.0.0.1:8000/api/v1";
const HEADLESS = process.env.HEADLESS !== "false";
const REPO_ROOT = path.resolve(__dirname, "../../..");
const RESULTS_DIR = process.env.RESULTS_DIR || path.join(REPO_ROOT, "testing");
const SCREENSHOT_DIR = path.join(RESULTS_DIR, "screenshots");
const ARTIFACT_DIR = path.join(RESULTS_DIR, "artifacts");

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const results = {
  started_at: new Date().toISOString(),
  target_url: TARGET_URL,
  api_url: API_URL,
  checks: [],
  errors: [],
  console_errors: [],
  network_errors: [],
  project: null,
};

function record(name, status, details = {}) {
  results.checks.push({ name, status, ...details });
  const marker = status === "pass" ? "PASS" : status === "warn" ? "WARN" : "FAIL";
  console.log(`${marker}: ${name}`);
}

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createPng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const rowLength = 1 + width * 3;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * rowLength] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = y * rowLength + 1 + x * 3;
      const panel = Math.floor(x / (width / 3)) + Math.floor(y / (height / 4));
      const shade = panel % 2 === 0 ? 245 : 224;
      raw[offset] = shade;
      raw[offset + 1] = shade;
      raw[offset + 2] = shade;
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

(async () => {
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const request = page.request;

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      results.console_errors.push({ type: message.type(), text: message.text() });
    }
  });
  page.on("requestfailed", (failedRequest) => {
    results.network_errors.push({
      url: failedRequest.url(),
      failure: failedRequest.failure()?.errorText,
    });
  });

  try {
    const health = await request.get(`${API_URL}/health`);
    record("Backend health endpoint returns 200", health.ok() ? "pass" : "fail", {
      status_code: health.status(),
    });

    const publicProjects = await request.get(`${API_URL}/projects`);
    record("Projects endpoint works without auth", publicProjects.ok() ? "pass" : "fail", {
      status_code: publicProjects.status(),
    });

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Translate and typeset/i }).waitFor();
    record("Landing page loads", "pass", { screenshot: await screenshot(page, "01-landing.png") });

    const pngBuffer = createPng(900, 1200);
    await page.setInputFiles("input[type='file']", {
      name: "usability-basic-page.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });
    await page.getByRole("heading", { name: "New Project Setup" }).waitFor();
    record("Image upload enters project setup", "pass", {
      screenshot: await screenshot(page, "02-project-setup.png"),
    });

    const projectName = `Usability Basic ${Date.now()}`;
    const nameInput = page.locator("input").first();
    await nameInput.fill(projectName);
    await page.getByRole("button", { name: /Start AI Processing/i }).click();
    await page.waitForURL(/\/projects\/[^/]+\/processing/, { timeout: 30000 });
    const projectId = new URL(page.url()).pathname.split("/")[2];
    results.project = { id: projectId, name: projectName };
    await page.getByRole("heading", { name: projectName }).waitFor();
    record("Project creates, uploads, and navigates to processing", "pass", {
      project_id: projectId,
      screenshot: await screenshot(page, "03-processing.png"),
    });

    await page.getByRole("link", { name: /Review flagged regions/i }).waitFor({ timeout: 30000 });
    record("Processing reaches review-ready state", "pass", {
      screenshot: await screenshot(page, "04-processing-complete.png"),
    });

    await page.goto(`${TARGET_URL}/projects/${projectId}/review`, { waitUntil: "domcontentloaded" });
    await page.getByText("Quality Review Mode").waitFor();
    record("Review page loads with project data", "pass", {
      screenshot: await screenshot(page, "05-review.png"),
    });

    await page.getByRole("link", { name: /Open Editor/i }).click();
    await page.waitForURL(/\/editor$/);
    await page.getByRole("heading", { name: /detected regions/i }).waitFor();
    record("Editor loads page canvas and region panel", "pass", {
      screenshot: await screenshot(page, "06-editor.png"),
    });

    const regionTextarea = page.locator("textarea").first();
    if ((await regionTextarea.count()) > 0) {
      await regionTextarea.fill("Usability edited translation");
      const saveButtons = page.getByRole("button", { name: /^Save$/i });
      if ((await saveButtons.count()) > 0) {
        await saveButtons.first().click();
        record("Region edit save control is usable", "pass");
      } else {
        record("Region edit save control is not discoverable", "warn");
      }
    } else {
      record("Region text editor is not available", "warn");
    }

    await page.goto(`${TARGET_URL}/projects/${projectId}/export`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Export Project" }).waitFor();
    await page.getByRole("button", { name: /PDF.*One PDF built from rendered pages/i }).click();
    await page.locator("input").first().fill(`${projectName}-pdf`);
    await page.getByRole("button", { name: /Export Project/i }).click();
    try {
      await page.getByText("Export job").waitFor({ timeout: 10000 });
      await page.getByRole("link", { name: /Download export/i }).waitFor({ timeout: 20000 });
      record("Export job completes and exposes download link", "pass", {
        screenshot: await screenshot(page, "07-export-ready.png"),
      });
    } catch (error) {
      record("Export job completes and exposes download link", "fail", {
        error: error.message,
        screenshot: await screenshot(page, "07-export-failed.png"),
      });
    }

    await page.goto(`${TARGET_URL}/projects`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Projects" }).waitFor();
    await page.locator("main input[placeholder='Search projects...']").fill(projectName);
    await page.getByText(projectName).waitFor();
    record("Dashboard lists and filters the created project", "pass", {
      screenshot: await screenshot(page, "08-dashboard-search.png"),
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${TARGET_URL}/projects/${projectId}/export`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Export Project" }).waitFor();
    record("Export page renders on mobile viewport", "pass", {
      screenshot: await screenshot(page, "09-mobile-export.png"),
    });
  } catch (error) {
    results.errors.push({ message: error.message, stack: error.stack });
    try {
      await screenshot(page, "error-state.png");
    } catch {
      // Best effort only; preserve the primary workflow error.
    }
    record("End-to-end browser workflow", "fail", { error: error.message });
    process.exitCode = 1;
  } finally {
    results.completed_at = new Date().toISOString();
    results.summary = {
      passed: results.checks.filter((check) => check.status === "pass").length,
      warnings: results.checks.filter((check) => check.status === "warn").length,
      failed: results.checks.filter((check) => check.status === "fail").length,
      console_errors: results.console_errors.length,
      network_errors: results.network_errors.length,
    };
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "basic-functionality-results.json"),
      JSON.stringify(results, null, 2),
    );
    await browser.close();
  }
})();
