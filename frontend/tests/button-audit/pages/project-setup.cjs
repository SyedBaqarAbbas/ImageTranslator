const { auditPage, prepares } = require("../core.cjs");

auditPage({
  pageName: "project-setup",
  path: "/projects/new",
  prepare: prepares.projectSetupWithFixture,
  expectedButtons: [
    { label: "Start AI Processing", kind: "navigates", expectedPathPattern: /^\/projects\/[^/]+\/processing$/ },
  ],
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
