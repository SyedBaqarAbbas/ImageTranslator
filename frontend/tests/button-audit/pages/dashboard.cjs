const { auditPage } = require("../core.cjs");

auditPage({ pageName: "dashboard", path: "/projects" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
