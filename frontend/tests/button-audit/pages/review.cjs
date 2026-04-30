const { auditPage, prepares } = require("../core.cjs");

auditPage({
  pageName: "review",
  path: "/projects/:projectId/review",
  prepare: prepares.projectRoute("review"),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
