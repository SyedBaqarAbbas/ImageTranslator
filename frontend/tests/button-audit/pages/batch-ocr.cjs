const { auditPage } = require("../core.cjs");
const { withWorkspaceShell } = require("../expectations.cjs");

auditPage({
  pageName: "batch-ocr",
  path: "/batch-ocr",
  expectedButtons: withWorkspaceShell([
    { label: "Run OCR", kind: "changesUiState" },
  ]),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
