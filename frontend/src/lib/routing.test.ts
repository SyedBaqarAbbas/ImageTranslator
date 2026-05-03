import { describe, expect, it } from "vitest";

import { routeForProject, statusLabel, statusTone } from "./routing";
import type { ProjectRead } from "../types/api";

const baseProject: ProjectRead = {
  id: "project-1",
  user_id: "user-1",
  name: "Cyber Neon",
  description: null,
  source_language: "ja",
  target_language: "en",
  translation_tone: "natural",
  replacement_mode: "replace",
  reading_direction: "rtl",
  status: "draft",
  failure_reason: null,
  created_at: "2026-04-01T00:00:00.000Z",
  updated_at: "2026-04-01T00:00:00.000Z",
};

describe("project routing helpers", () => {
  it("routes review-required projects into the review workflow", () => {
    expect(routeForProject({ ...baseProject, status: "review_required" })).toBe("/projects/project-1/review");
  });

  it("routes every MVP status to its workflow landing page", () => {
    expect(routeForProject({ ...baseProject, status: "draft" })).toBe("/projects/project-1/processing");
    expect(routeForProject({ ...baseProject, status: "ready" })).toBe("/projects/project-1/processing");
    expect(routeForProject({ ...baseProject, status: "uploading" })).toBe("/projects/project-1/processing");
    expect(routeForProject({ ...baseProject, status: "processing" })).toBe("/projects/project-1/processing");
    expect(routeForProject({ ...baseProject, status: "ocr_complete" })).toBe("/projects/project-1/processing");
    expect(routeForProject({ ...baseProject, status: "translation_complete" })).toBe("/projects/project-1/processing");
    expect(routeForProject({ ...baseProject, status: "completed" })).toBe("/projects/project-1/editor");
    expect(routeForProject({ ...baseProject, status: "failed" })).toBe("/projects/project-1/processing");
    expect(routeForProject({ ...baseProject, status: "unknown" })).toBe("/projects/project-1/editor");
  });

  it("routes export-ready projects into export", () => {
    expect(routeForProject({ ...baseProject, status: "export_ready" })).toBe("/projects/project-1/export");
  });

  it("formats backend status strings for UI labels", () => {
    expect(statusLabel("translation_complete")).toBe("Translation Complete");
  });

  it("maps status tones for all visible status families", () => {
    expect(statusTone("failed")).toBe("red");
    expect(statusTone("processing")).toBe("cyan");
    expect(statusTone("ocr_running")).toBe("cyan");
    expect(statusTone("review_required")).toBe("amber");
    expect(statusTone("needs_review")).toBe("amber");
    expect(statusTone("ocr_low_confidence")).toBe("amber");
    expect(statusTone("completed")).toBe("green");
    expect(statusTone("export_ready")).toBe("green");
    expect(statusTone("succeeded")).toBe("green");
    expect(statusTone("user_edited")).toBe("green");
    expect(statusTone("draft")).toBe("violet");
    expect(statusTone("ready")).toBe("violet");
    expect(statusTone("uploaded")).toBe("slate");
  });
});
