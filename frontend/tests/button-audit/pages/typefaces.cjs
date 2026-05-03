const { auditPage } = require("../core.cjs");
const { withWorkspaceShell } = require("../expectations.cjs");

auditPage({
  pageName: "typefaces",
  path: "/typefaces",
  expectedButtons: withWorkspaceShell([
    { label: "Anime Ace", occurrence: 0, kind: "currentSelection" },
    { pattern: /^(Anime Ace|Komika|Inter|Noto Sans|Merriweather)$/, kind: "changesUiState" },
  ]),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
