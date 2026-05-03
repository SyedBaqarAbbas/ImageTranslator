const workspaceShell = [
  { label: "Notifications", kind: "opensPopover", expectedText: "No new workspace notifications." },
  { label: "Help", kind: "opensPopover", expectedText: "Workspace settings" },
  { label: "Share", kind: "opensPopover", expectedText: "Coming Soon" },
  { pattern: /^New project$/i, kind: "navigates", expectedPath: "/" },
  { pattern: /^New Project$/i, kind: "navigates", expectedPath: "/" },
];

const landingShell = [
  { label: "Notifications", kind: "opensPopover", expectedText: "No new workspace notifications." },
  { label: "Help", kind: "opensPopover", expectedText: "Workspace settings" },
  { label: "Share", kind: "opensPopover", expectedText: "Coming Soon" },
  { pattern: /^New project$/i, kind: "intentionalNoop" },
];

function withWorkspaceShell(expectedButtons = []) {
  return [...expectedButtons, ...workspaceShell];
}

module.exports = {
  landingShell,
  workspaceShell,
  withWorkspaceShell,
};
