const { auditPage } = require("../core.cjs");

auditPage({ pageName: "processing", path: "/projects/project-cyber/processing" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
