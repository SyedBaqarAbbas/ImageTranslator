import { describe, expect, it } from "vitest";

import { exportFailureMessage, isExportJobActive } from "../lib/exportStatus";

describe("Export helpers", () => {
  it("treats queued and running export jobs as active", () => {
    expect(isExportJobActive("queued")).toBe(true);
    expect(isExportJobActive("running")).toBe(true);
    expect(isExportJobActive("failed")).toBe(false);
    expect(isExportJobActive("succeeded")).toBe(false);
  });

  it("preserves backend failed job messages and adds a next action when needed", () => {
    expect(exportFailureMessage("No rendered pages were available to export.", 1)).toBe(
      "No rendered pages were available to export. Process the project first, then try again.",
    );
    expect(exportFailureMessage("Backend-specific export failure.", 1)).toBe("Backend-specific export failure.");
  });

  it("explains the empty project path when no backend message is available", () => {
    expect(exportFailureMessage(null, 0)).toBe(
      "No pages are available to export. Upload at least one page, process it, then try again.",
    );
  });
});
