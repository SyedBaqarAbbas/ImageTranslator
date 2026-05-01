const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "../../../..");
const targetUrl = process.env.TARGET_URL || "http://127.0.0.1:5173";
const resultsRoot = process.env.RESULTS_DIR || path.join(repoRoot, "testing", "button-audit");
const outputDir = path.join(resultsRoot, "team");

async function auditDisabledTeamRoute() {
  const startedAt = new Date().toISOString();
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== "false" });
  let finalPath = "";

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(new URL("/team", targetUrl).toString(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    finalPath = new URL(page.url()).pathname;
  } finally {
    await browser.close();
  }

  const passed = finalPath === "/projects";
  const completedAt = new Date().toISOString();
  const summary = {
    total: 0,
    changed: 0,
    noObservableChange: 0,
    skippedDisabled: 0,
    skippedHidden: 0,
    skippedCurrent: 0,
    errors: passed ? 0 : 1,
  };
  const jsonPath = path.join(outputDir, "button-audit.json");
  const reportPath = path.join(outputDir, "button-audit.md");
  const payload = {
    pageName: "team",
    path: "/team",
    targetUrl,
    startedAt,
    completedAt,
    summary,
    skipped: true,
    reason: "Team page is disabled for the prototype and should redirect to /projects.",
    finalPath,
    buttons: [],
    jsonPath,
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  fs.writeFileSync(
    reportPath,
    [
      "# Button Audit: team",
      "",
      "Team page controls are intentionally disabled for the prototype.",
      "",
      `- Requested path: \`/team\``,
      `- Final path: \`${finalPath || "(unavailable)"}\``,
      `- Result: ${passed ? "PASS" : "FAIL"}`,
      "",
    ].join("\n"),
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

auditDisabledTeamRoute().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
