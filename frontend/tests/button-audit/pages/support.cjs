const { auditPage } = require("../core.cjs");

auditPage({ pageName: "support", path: "/support" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
