import { afterEach, describe, expect, it, vi } from "vitest";

async function loadMockApi() {
  vi.resetModules();
  const module = await import("./mockAdapter");
  return module.mockApi;
}

describe("mockApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns locked runtime language metadata", async () => {
    const mockApi = await loadMockApi();

    await expect(mockApi.getRuntimeLanguage()).resolves.toMatchObject({
      source_language: "auto",
      target_language: "en",
      locked: true,
      lock_message: "Ask a system administrator to change the language.",
    });
  });

  it("soft deletes projects and hides them from project reads", async () => {
    const mockApi = await loadMockApi();

    expect((await mockApi.listProjects()).some((project) => project.id === "project-cyber")).toBe(true);

    await mockApi.deleteProject("project-cyber");

    expect((await mockApi.listProjects()).some((project) => project.id === "project-cyber")).toBe(false);
    await expect(mockApi.getProject("project-cyber")).rejects.toThrow("Project not found.");
  });
});
