import { afterEach, describe, expect, it, vi } from "vitest";

async function loadMockApi() {
  vi.resetModules();
  const module = await import("./mockAdapter");
  return module.mockApi;
}

async function resolveDelayed<T>(promise: Promise<T>, ms = 180): Promise<T> {
  await vi.advanceTimersByTimeAsync(ms);
  return promise;
}

describe("mockApi", () => {
  afterEach(() => {
    vi.useRealTimers();
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

  it("reports completed retranslation jobs with updated region text", async () => {
    vi.useFakeTimers();
    const mockApi = await loadMockApi();
    const pages = await resolveDelayed(mockApi.listPages("project-cyber"));
    const regions = await resolveDelayed(mockApi.listRegions(pages[0].id));

    const acceptedJob = await resolveDelayed(
      mockApi.retranslateRegion(regions[0].id, {
        source_text: "Fresh source",
      }),
    );

    expect(acceptedJob.status).toBe("queued");

    await vi.advanceTimersByTimeAsync(900);
    const completedJob = await resolveDelayed(mockApi.getProcessingJob(acceptedJob.id));
    const updatedRegions = await resolveDelayed(mockApi.listRegions(pages[0].id));

    expect(completedJob.status).toBe("succeeded");
    expect(updatedRegions.find((item) => item.id === regions[0].id)?.translated_text).toBe("Fresh source (AI polished)");
  });
});
