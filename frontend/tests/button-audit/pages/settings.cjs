const { auditPage } = require("../core.cjs");
const { withWorkspaceShell } = require("../expectations.cjs");

auditPage({
  pageName: "settings",
  path: "/settings",
  expectedButtons: withWorkspaceShell([
    { label: "balanced quality", kind: "currentSelection" },
    { label: "high quality", kind: "changesUiState" },
    { label: "Save settings", kind: "changesUiState" },
  ]),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
