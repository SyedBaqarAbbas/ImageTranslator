const { auditPage } = require("../core.cjs");

auditPage({ pageName: "landing", path: "/" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
