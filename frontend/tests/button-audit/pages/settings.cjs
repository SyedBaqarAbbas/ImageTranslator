const { auditPage } = require("../core.cjs");

auditPage({ pageName: "settings", path: "/settings" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
