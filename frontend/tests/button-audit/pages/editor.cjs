const { auditPage, prepares } = require("../core.cjs");
const { withWorkspaceShell } = require("../expectations.cjs");

auditPage({
  pageName: "editor",
  path: "/projects/:projectId/editor",
  prepare: prepares.projectRoute("editor"),
  expectedButtons: withWorkspaceShell([
    { label: "Undo", kind: "disabledExpected" },
    { label: "Reset view", kind: "changesUiState" },
    { label: "original", kind: "changesUiState" },
    { label: "translated", kind: "currentSelection" },
    { label: "Compare split", kind: "changesUiState" },
    { label: "Zoom out", kind: "changesUiState" },
    { label: "Zoom in", kind: "changesUiState" },
    { label: "P1", kind: "disabledExpected" },
    { label: "Where did the signal go?", kind: "currentSelection" },
    { label: "Keep moving. We are exposed.", kind: "changesUiState" },
    { pattern: /^#1 /, kind: "disabledExpected" },
    { pattern: /^#\d+ /, kind: "changesUiState" },
    { label: "Reject", kind: "changesUiState" },
    { label: "Retranslate region", kind: "changesUiState" },
    { label: "Pick", kind: "changesUiState" },
    { label: "Save", kind: "changesUiState" },
    { label: "Approve", kind: "changesUiState" },
    { label: "Save workspace", kind: "changesUiState" },
  ]),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
