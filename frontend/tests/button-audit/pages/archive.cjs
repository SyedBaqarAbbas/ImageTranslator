const { auditPage } = require("../core.cjs");
const { withWorkspaceShell } = require("../expectations.cjs");

auditPage({ pageName: "archive", path: "/archive", expectedButtons: withWorkspaceShell() }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
