const { auditPage } = require("../core.cjs");

auditPage({ pageName: "editor", path: "/projects/project-cyber/editor" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
