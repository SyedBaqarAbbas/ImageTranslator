const { auditPage } = require("../core.cjs");

auditPage({ pageName: "archive", path: "/archive" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
