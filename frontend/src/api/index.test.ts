import { afterEach, describe, expect, it, vi } from "vitest";

describe("api adapter selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the mock adapter by default", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");

    const { api, queryKeys } = await import("./index");
    const { mockApi } = await import("./mockAdapter");

    expect(api).toBe(mockApi);
    expect(queryKeys.project("project-1")).toEqual(["project", "project-1"]);
    expect(queryKeys.page("project-1", "page-1")).toEqual(["page", "project-1", "page-1"]);
  });

  it("uses the HTTP adapter when configured", async () => {
    vi.stubEnv("VITE_API_MODE", "http");

    const { api } = await import("./index");
    const { httpApi } = await import("./httpAdapter");

    expect(api).toBe(httpApi);
  });
});
