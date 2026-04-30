const { auditPage, prepares } = require("../core.cjs");

auditPage({
  pageName: "editor",
  path: "/projects/:projectId/editor",
  prepare: prepares.projectRoute("editor"),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
