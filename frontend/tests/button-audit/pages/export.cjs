const { auditPage, prepares } = require("../core.cjs");
const { withWorkspaceShell } = require("../expectations.cjs");

auditPage({
  pageName: "export",
  path: "/projects/:projectId/export",
  prepare: prepares.projectRoute("export", "project-samurai"),
  expectedButtons: withWorkspaceShell([
    { pattern: /^Full ZIP/, kind: "currentSelection" },
    { pattern: /^PDF/, kind: "changesUiState" },
    { pattern: /^Image ZIP/, kind: "changesUiState" },
    { label: "Export Project", kind: "changesUiState" },
  ]),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
