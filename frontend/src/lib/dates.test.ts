import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatRelative } from "./dates";

describe("formatRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats minute, hour, and day distances", () => {
    expect(formatRelative("2026-05-03T11:45:00Z")).toBe("15 minutes ago");
    expect(formatRelative("2026-05-03T14:00:00Z")).toBe("in 2 hours");
    expect(formatRelative("2026-05-01T12:00:00Z")).toBe("2 days ago");
  });
});
