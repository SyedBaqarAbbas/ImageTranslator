import { describe, expect, it } from "vitest";

import { routeForProject, statusLabel } from "./routing";
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

  it("routes export-ready projects into export", () => {
    expect(routeForProject({ ...baseProject, status: "export_ready" })).toBe("/projects/project-1/export");
  });

  it("formats backend status strings for UI labels", () => {
    expect(statusLabel("translation_complete")).toBe("Translation Complete");
  });
});
