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

  it("soft deletes projects and hides them from project reads", async () => {
    const mockApi = await loadMockApi();

    expect((await mockApi.listProjects()).some((project) => project.id === "project-cyber")).toBe(true);

    await mockApi.deleteProject("project-cyber");

    expect((await mockApi.listProjects()).some((project) => project.id === "project-cyber")).toBe(false);
    await expect(mockApi.getProject("project-cyber")).rejects.toThrow("Project not found.");
  });
});
