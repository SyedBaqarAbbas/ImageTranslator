export function isExportJobActive(status: string | null | undefined): boolean {
  return status === "queued" || status === "running";
}

export function exportFailureMessage(message: string | null | undefined, pageCount: number): string {
  const base = message?.trim();
  if (!base) {
    return pageCount === 0
      ? "No pages are available to export. Upload at least one page, process it, then try again."
      : "Export failed. Check that the project has rendered pages, then try again.";
  }

  const normalized = base.toLowerCase();
  if (normalized.includes("no pages") && !normalized.includes("upload")) {
    return `${base} Upload at least one page, process it, then try again.`;
  }
  if (normalized.includes("no rendered") && !normalized.includes("process")) {
    return `${base} Process the project first, then try again.`;
  }
  return base;
}
