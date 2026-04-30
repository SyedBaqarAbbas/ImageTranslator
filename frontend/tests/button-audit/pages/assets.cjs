const { auditPage } = require("../core.cjs");

auditPage({ pageName: "assets", path: "/assets" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
