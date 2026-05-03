import { describe, expect, it, vi } from "vitest";

import { waitForSuccessfulRetranslateJob } from "./retranslateJob";
import type { ProcessingJobRead } from "../types/api";

function processingJob(status: string, errorMessage: string | null = null): ProcessingJobRead {
  return {
    id: "job-1",
    project_id: "project-1",
    page_id: "page-1",
    region_id: "region-1",
    job_type: "retranslate_region",
    status,
    progress: status === "succeeded" ? 100 : 45,
    stage: status === "succeeded" ? "complete" : "translating_region",
    error_code: errorMessage ? "provider_error" : null,
    error_message: errorMessage,
    attempts: 1,
    max_attempts: 3,
    celery_task_id: null,
    result: null,
    started_at: "2026-05-01T00:00:00Z",
    completed_at: status === "succeeded" ? "2026-05-01T00:00:12Z" : null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  };
}

describe("waitForSuccessfulRetranslateJob", () => {
  it("keeps polling beyond the old fixed retry window until the job succeeds", async () => {
    const runningJobs = Array.from({ length: 30 }, () => processingJob("running"));
    const getProcessingJob = vi.fn<(jobId: string) => Promise<ProcessingJobRead>>();
    for (const job of runningJobs) {
      getProcessingJob.mockResolvedValueOnce(job);
    }
    getProcessingJob.mockResolvedValueOnce(processingJob("succeeded"));
    const waitForNextPoll = vi.fn<(_ms: number) => Promise<void>>().mockResolvedValue(undefined);

    const result = await waitForSuccessfulRetranslateJob(processingJob("queued"), {
      getProcessingJob,
      waitForNextPoll,
    });

    expect(result.status).toBe("succeeded");
    expect(getProcessingJob).toHaveBeenCalledTimes(31);
    expect(waitForNextPoll).toHaveBeenCalledTimes(31);
  });

  it("throws only when the backend reports a terminal failure", async () => {
    const getProcessingJob = vi.fn<(jobId: string) => Promise<ProcessingJobRead>>().mockResolvedValue(processingJob("failed", "Provider unavailable."));
    const waitForNextPoll = vi.fn<(_ms: number) => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      waitForSuccessfulRetranslateJob(processingJob("queued"), {
        getProcessingJob,
        waitForNextPoll,
      }),
    ).rejects.toThrow("Provider unavailable.");
  });

  it("returns immediately for already successful jobs", async () => {
    const getProcessingJob = vi.fn<(jobId: string) => Promise<ProcessingJobRead>>();

    await expect(
      waitForSuccessfulRetranslateJob(processingJob("succeeded"), {
        getProcessingJob,
      }),
    ).resolves.toMatchObject({ status: "succeeded" });
    expect(getProcessingJob).not.toHaveBeenCalled();
  });

  it("falls back to a status-specific error message for cancelled jobs", async () => {
    const getProcessingJob = vi.fn<(jobId: string) => Promise<ProcessingJobRead>>();

    await expect(
      waitForSuccessfulRetranslateJob(processingJob("cancelled"), {
        getProcessingJob,
      }),
    ).rejects.toThrow("Translation job cancelled.");
  });
});
