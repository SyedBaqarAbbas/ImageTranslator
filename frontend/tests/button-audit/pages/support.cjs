const { auditPage } = require("../core.cjs");
const { withWorkspaceShell } = require("../expectations.cjs");

auditPage({
  pageName: "support",
  path: "/support",
  expectedButtons: withWorkspaceShell([
    { label: "Draft request", kind: "changesUiState" },
  ]),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
