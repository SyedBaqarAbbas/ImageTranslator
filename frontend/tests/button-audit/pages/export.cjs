const { auditPage } = require("../core.cjs");

auditPage({ pageName: "export", path: "/projects/project-samurai/export" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
