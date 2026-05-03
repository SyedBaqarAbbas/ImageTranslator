const { auditPage } = require("../core.cjs");
const { withWorkspaceShell } = require("../expectations.cjs");

auditPage({
  pageName: "dashboard",
  path: "/projects",
  expectedButtons: withWorkspaceShell([
    { label: "All", kind: "currentSelection" },
    { label: "In Progress", kind: "changesUiState" },
    { label: "Completed", kind: "changesUiState" },
    { label: "Filters", kind: "opensPopover", expectedText: "Project filters" },
    { pattern: /^Open .* options$/, kind: "opensPopover", expectedText: "Export" },
    { label: "Create New Project", kind: "navigates", expectedPath: "/" },
  ]),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
