const path = require("path");
const { spawnSync } = require("child_process");
const fs = require("fs");

const repoRoot = path.resolve(__dirname, "../../..");
const resultsRoot = process.env.RESULTS_DIR || path.join(repoRoot, "testing", "button-audit");

const defaultPages = [
  "landing",
  "dashboard",
  "project-setup",
  "assets",
  "settings",
  "batch-ocr",
  "typefaces",
  "archive",
  "account",
  "support",
  "processing",
  "review",
  "editor",
  "export",
];
const pages = process.env.BUTTON_AUDIT_PAGES
  ? process.env.BUTTON_AUDIT_PAGES.split(",").map((page) => page.trim()).filter(Boolean)
  : defaultPages;

let failed = false;
const summaries = [];
for (const pageName of pages) {
  const script = path.join(__dirname, "pages", `${pageName}.cjs`);
  console.log(`\n=== Button audit: ${pageName} ===`);
  const result = spawnSync(process.execPath, [script], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    failed = true;
  }
  const resultPath = path.join(resultsRoot, pageName, "button-audit.json");
  if (fs.existsSync(resultPath)) {
    const pageResult = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    summaries.push({
      pageName,
      path: pageResult.path,
      report: path.relative(repoRoot, path.join(resultsRoot, pageName, "button-audit.md")),
      ...pageResult.summary,
    });
  }
}

fs.mkdirSync(resultsRoot, { recursive: true });
const aggregate = {
  targetUrl: process.env.TARGET_URL || "http://127.0.0.1:5173",
  completedAt: new Date().toISOString(),
  pages: summaries,
  totals: summaries.reduce(
    (current, page) => ({
      total: current.total + page.total,
      changed: current.changed + page.changed,
      noObservableChange: current.noObservableChange + page.noObservableChange,
      skippedDisabled: current.skippedDisabled + page.skippedDisabled,
      skippedHidden: current.skippedHidden + page.skippedHidden,
      skippedCurrent: current.skippedCurrent + page.skippedCurrent,
      errors: current.errors + page.errors,
    }),
    {
      total: 0,
      changed: 0,
      noObservableChange: 0,
      skippedDisabled: 0,
      skippedHidden: 0,
      skippedCurrent: 0,
      errors: 0,
    },
  ),
};
fs.writeFileSync(path.join(resultsRoot, "summary.json"), JSON.stringify(aggregate, null, 2));
fs.writeFileSync(
  path.join(resultsRoot, "summary.md"),
  [
    "# Button Audit Summary",
    "",
    `Run time: ${aggregate.completedAt}`,
    `Target: ${aggregate.targetUrl}`,
    "",
    "## Totals",
    "",
    `- Total buttons: ${aggregate.totals.total}`,
    `- Changed something observable: ${aggregate.totals.changed}`,
    `- No observable change: ${aggregate.totals.noObservableChange}`,
    `- Skipped disabled: ${aggregate.totals.skippedDisabled}`,
    `- Skipped hidden: ${aggregate.totals.skippedHidden}`,
    `- Skipped current/selected: ${aggregate.totals.skippedCurrent}`,
    `- Errors or browser issues: ${aggregate.totals.errors}`,
    "",
    "## Pages",
    "",
    ...aggregate.pages.map(
      (page) =>
        `- ${page.pageName}: total ${page.total}, changed ${page.changed}, no observable change ${page.noObservableChange}, current/selected ${page.skippedCurrent}, errors ${page.errors}. Report: \`${page.report}\``,
    ),
    "",
  ].join("\n"),
);

if (failed) {
  process.exitCode = 1;
}
