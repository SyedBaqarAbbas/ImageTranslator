const { auditPage } = require("../core.cjs");

auditPage({ pageName: "team", path: "/team" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
