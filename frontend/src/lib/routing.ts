import type { ProjectRead } from "../types/api";

export function routeForProject(project: ProjectRead): string {
  switch (project.status) {
    case "draft":
    case "ready":
      return `/projects/${project.id}/processing`;
    case "uploading":
    case "processing":
    case "ocr_complete":
    case "translation_complete":
      return `/projects/${project.id}/processing`;
    case "review_required":
      return `/projects/${project.id}/review`;
    case "completed":
      return `/projects/${project.id}/editor`;
    case "export_ready":
      return `/projects/${project.id}/export`;
    case "failed":
      return `/projects/${project.id}/processing`;
    default:
      return `/projects/${project.id}/editor`;
  }
}

export function statusLabel(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function statusTone(status: string): "accent" | "active" | "warning" | "danger" | "success" | "neutral" {
  if (status === "failed") return "danger";
  if (status === "processing" || status.endsWith("running")) return "active";
  if (status === "review_required" || status === "needs_review" || status === "ocr_low_confidence") return "warning";
  if (status === "completed" || status === "export_ready" || status === "succeeded" || status === "user_edited") return "success";
  if (status === "draft" || status === "ready") return "accent";
  return "neutral";
}
