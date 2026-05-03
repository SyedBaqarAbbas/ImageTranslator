const { auditPage } = require("../core.cjs");
const { landingShell } = require("../expectations.cjs");

auditPage({
  pageName: "landing",
  path: "/",
  expectedButtons: [
    ...landingShell,
    { pattern: /Drag and drop comic pages/i, kind: "opensFileChooser" },
    { label: "Open dashboard", kind: "navigates", expectedPath: "/projects" },
  ],
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
