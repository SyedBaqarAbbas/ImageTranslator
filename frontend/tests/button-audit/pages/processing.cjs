const { auditPage, prepares } = require("../core.cjs");
const { withWorkspaceShell } = require("../expectations.cjs");

auditPage({
  pageName: "processing",
  path: "/projects/:projectId/processing",
  prepare: prepares.projectRoute("processing"),
  expectedButtons: withWorkspaceShell([
    { label: "Rerun Processing", kind: "changesUiState" },
    { label: "Cancel Processing", kind: "changesUiState" },
  ]),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
