const { auditPage, prepares } = require("../core.cjs");
const { withWorkspaceShell } = require("../expectations.cjs");

auditPage({
  pageName: "review",
  path: "/projects/:projectId/review",
  prepare: prepares.projectRoute("review"),
  expectedButtons: withWorkspaceShell([
    { label: "Approve", kind: "changesUiState" },
  ]),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
