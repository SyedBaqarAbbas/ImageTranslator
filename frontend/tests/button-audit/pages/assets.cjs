const { auditPage } = require("../core.cjs");
const { withWorkspaceShell } = require("../expectations.cjs");

auditPage({ pageName: "assets", path: "/assets", expectedButtons: withWorkspaceShell() }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
