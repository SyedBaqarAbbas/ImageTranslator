const { auditPage } = require("../core.cjs");

auditPage({ pageName: "review", path: "/projects/project-cyber/review" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
