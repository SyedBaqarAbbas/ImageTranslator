const { auditPage, prepares } = require("../core.cjs");

auditPage({
  pageName: "project-setup",
  path: "/projects/new",
  prepare: prepares.projectSetupWithFixture,
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
