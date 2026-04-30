const { auditPage, prepares } = require("../core.cjs");

auditPage({
  pageName: "export",
  path: "/projects/:projectId/export",
  prepare: prepares.projectRoute("export", "project-samurai"),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
