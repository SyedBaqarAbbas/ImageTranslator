const nodeCrypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const TARGET_URL = process.env.TARGET_URL || "http://127.0.0.1:5173";
const RESULTS_ROOT = process.env.RESULTS_DIR || path.join(REPO_ROOT, "testing", "button-audit");
const HEADLESS = process.env.HEADLESS !== "false";
const CLICK_TIMEOUT = Number(process.env.BUTTON_AUDIT_CLICK_TIMEOUT || 5000);
const POST_CLICK_WAIT_MS = Number(process.env.BUTTON_AUDIT_POST_CLICK_WAIT_MS || 700);

const BUTTON_SELECTOR = [
  "button",
  "[role='button']",
  "input[type='button']",
  "input[type='submit']",
  "input[type='reset']",
].join(", ");

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

function absoluteUrl(pagePath) {
  return new URL(pagePath, TARGET_URL).toString();
}

function hash(value) {
  return nodeCrypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

async function waitForAppSettled(page) {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(250);
}

async function defaultPrepare(page, pagePath) {
  await page.goto(absoluteUrl(pagePath), { waitUntil: "domcontentloaded" });
  await waitForAppSettled(page);
}

async function projectSetupWithFixture(page) {
  await page.goto(absoluteUrl("/"), { waitUntil: "domcontentloaded" });
  await page.setInputFiles("input[type='file']", {
    name: "button-audit-page.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  await page.waitForURL("**/projects/new", { timeout: 10000 });
  await waitForAppSettled(page);
}

async function snapshot(page) {
  return page.evaluate((buttonSelector) => {
    const text = document.body.innerText || "";
    const buttons = Array.from(document.querySelectorAll(buttonSelector)).map((element, index) => ({
      index,
      label:
        element.getAttribute("aria-label") ||
        element.textContent?.replace(/\s+/g, " ").trim() ||
        element.getAttribute("title") ||
        element.getAttribute("value") ||
        element.tagName.toLowerCase(),
      ariaExpanded: element.getAttribute("aria-expanded"),
      ariaPressed: element.getAttribute("aria-pressed"),
      className:
        typeof element.className === "string"
          ? element.className
          : element.getAttribute("class") || "",
      disabled:
        element.hasAttribute("disabled") ||
        element.getAttribute("aria-disabled") === "true",
    }));

    return {
      url: window.location.href,
      title: document.title,
      text,
      html: document.body.innerHTML,
      buttons,
    };
  }, BUTTON_SELECTOR);
}

function summarizeSnapshot(raw) {
  const text = normalizeText(raw.text);
  return {
    url: raw.url,
    pathname: new URL(raw.url).pathname + new URL(raw.url).search,
    title: raw.title,
    textHash: hash(text),
    htmlHash: hash(raw.html),
    textExcerpt: text.slice(0, 600),
    buttonStateHash: hash(JSON.stringify(raw.buttons)),
  };
}

async function collectButtons(page) {
  return page.locator(BUTTON_SELECTOR).evaluateAll((elements) =>
    elements.map((element, index) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const label =
        element.getAttribute("aria-label") ||
        element.textContent?.replace(/\s+/g, " ").trim() ||
        element.getAttribute("title") ||
        element.getAttribute("value") ||
        element.tagName.toLowerCase();
      return {
        index,
        label,
        tagName: element.tagName.toLowerCase(),
        type: element.getAttribute("type"),
        title: element.getAttribute("title"),
        ariaLabel: element.getAttribute("aria-label"),
        ariaExpanded: element.getAttribute("aria-expanded"),
        disabled:
          element.hasAttribute("disabled") ||
          element.getAttribute("aria-disabled") === "true",
        visible:
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none",
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    }),
  );
}

function classify(before, after, events, actionError, button) {
  if (!button.visible) return "skipped-hidden";
  if (button.disabled) return "skipped-disabled";
  if (!before || !after) return "error";
  if (actionError) return "error";
  const changed =
    before.url !== after.url ||
    before.textHash !== after.textHash ||
    before.htmlHash !== after.htmlHash ||
    before.buttonStateHash !== after.buttonStateHash ||
    events.fileChooser ||
    events.download ||
    events.dialog ||
    events.popup;
  return changed ? "changed" : "no-observable-change";
}

async function auditButton(browser, config, button) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  const events = {
    fileChooser: false,
    download: false,
    dialog: false,
    popup: false,
  };

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push({ type: message.type(), text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.stack || error.message);
  });
  page.on("requestfailed", (request) => {
    requestFailures.push({
      url: request.url(),
      failure: request.failure()?.errorText || "unknown",
    });
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().includes("/favicon")) {
      requestFailures.push({ url: response.url(), status: response.status() });
    }
  });

  let before = null;
  let after = null;
  let actionError = null;

  try {
    await config.prepare(page, config.path);
    before = summarizeSnapshot(await snapshot(page));

    if (!button.visible || button.disabled) {
      after = before;
    } else {
      const target = page.locator(BUTTON_SELECTOR).nth(button.index);
      const fileChooserPromise = page
        .waitForEvent("filechooser", { timeout: 1000 })
        .then(() => {
          events.fileChooser = true;
        })
        .catch(() => undefined);
      const downloadPromise = page
        .waitForEvent("download", { timeout: 1000 })
        .then(() => {
          events.download = true;
        })
        .catch(() => undefined);
      const dialogPromise = page
        .waitForEvent("dialog", { timeout: 1000 })
        .then(async (dialog) => {
          events.dialog = true;
          await dialog.dismiss().catch(() => undefined);
        })
        .catch(() => undefined);
      const popupPromise = page
        .waitForEvent("popup", { timeout: 1000 })
        .then(async (popup) => {
          events.popup = true;
          await popup.close().catch(() => undefined);
        })
        .catch(() => undefined);

      await target.scrollIntoViewIfNeeded({ timeout: CLICK_TIMEOUT }).catch(() => undefined);
      await target.click({ timeout: CLICK_TIMEOUT });
      await Promise.all([fileChooserPromise, downloadPromise, dialogPromise, popupPromise]);
      await page.waitForTimeout(POST_CLICK_WAIT_MS);
      await waitForAppSettled(page);
      after = summarizeSnapshot(await snapshot(page));
    }
  } catch (error) {
    actionError = error.stack || error.message;
    try {
      after = summarizeSnapshot(await snapshot(page));
    } catch {
      after = before;
    }
  } finally {
    await context.close();
  }

  const status = classify(before, after, events, actionError, button);
  return {
    page: config.pageName,
    button,
    status,
    observableChange: status === "changed",
    before,
    after,
    events,
    actionError,
    consoleMessages,
    pageErrors,
    requestFailures,
  };
}

function buildMarkdown(config, result) {
  const stale = result.buttons.filter((item) => item.status === "no-observable-change");
  const errors = result.buttons.filter(
    (item) =>
      item.status === "error" ||
      item.consoleMessages.length ||
      item.pageErrors.length ||
      item.requestFailures.length,
  );

  return [
    `# Button Audit: ${config.pageName}`,
    "",
    `Run time: ${result.completedAt}`,
    `Target: ${TARGET_URL}`,
    `Path: ${config.path}`,
    "",
    "## Summary",
    "",
    `- Total buttons found: ${result.summary.total}`,
    `- Changed something observable: ${result.summary.changed}`,
    `- No observable change: ${result.summary.noObservableChange}`,
    `- Skipped disabled: ${result.summary.skippedDisabled}`,
    `- Skipped hidden: ${result.summary.skippedHidden}`,
    `- Errors or browser issues: ${result.summary.errors}`,
    "",
    "## Likely Stale Buttons",
    "",
    stale.length
      ? stale
          .map(
            (item) =>
              `- #${item.button.index} "${item.button.label}" at ${item.button.rect.x},${item.button.rect.y} (${item.button.rect.width}x${item.button.rect.height})`,
          )
          .join("\n")
      : "None detected.",
    "",
    "## Errors",
    "",
    errors.length
      ? errors
          .map(
            (item) =>
              `- #${item.button.index} "${item.button.label}": ${item.actionError || item.consoleMessages[0]?.text || item.pageErrors[0] || JSON.stringify(item.requestFailures[0])}`,
          )
          .join("\n")
      : "None observed.",
    "",
    "## Full Results",
    "",
    `See \`${path.relative(REPO_ROOT, result.jsonPath)}\`.`,
    "",
  ].join("\n");
}

async function auditPage(options) {
  const config = {
    prepare: defaultPrepare,
    ...options,
  };
  const outputDir = path.join(RESULTS_ROOT, config.pageName);
  ensureDir(outputDir);

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 40 });
  let buttons = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await config.prepare(page, config.path);
    buttons = await collectButtons(page);
    await context.close();

    const results = [];
    for (const button of buttons) {
      const result = await auditButton(browser, config, button);
      results.push(result);
      console.log(`${config.pageName}: #${button.index} "${button.label}" -> ${result.status}`);
    }

    const completedAt = new Date().toISOString();
    const summary = {
      total: results.length,
      changed: results.filter((item) => item.status === "changed").length,
      noObservableChange: results.filter((item) => item.status === "no-observable-change").length,
      skippedDisabled: results.filter((item) => item.status === "skipped-disabled").length,
      skippedHidden: results.filter((item) => item.status === "skipped-hidden").length,
      errors: results.filter(
        (item) =>
          item.status === "error" ||
          item.consoleMessages.length ||
          item.pageErrors.length ||
          item.requestFailures.length,
      ).length,
    };
    const jsonPath = path.join(outputDir, "button-audit.json");
    const reportPath = path.join(outputDir, "button-audit.md");
    const payload = {
      pageName: config.pageName,
      path: config.path,
      targetUrl: TARGET_URL,
      startedAt: new Date().toISOString(),
      completedAt,
      summary,
      buttons: results,
      jsonPath,
    };
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    fs.writeFileSync(reportPath, buildMarkdown(config, payload));

    if (process.env.FAIL_ON_STALE === "true" && summary.noObservableChange > 0) {
      process.exitCode = 2;
    }
    return payload;
  } finally {
    await browser.close();
  }
}

module.exports = {
  auditPage,
  prepares: {
    defaultPrepare,
    projectSetupWithFixture,
  },
};
