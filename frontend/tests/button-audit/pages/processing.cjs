const { auditPage, prepares } = require("../core.cjs");

auditPage({
  pageName: "processing",
  path: "/projects/:projectId/processing",
  prepare: prepares.projectRoute("processing"),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
