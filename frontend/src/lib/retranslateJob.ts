import type { ProcessingJobRead } from "../types/api";

const RETRANSLATE_JOB_POLL_INTERVAL_MS = 500;
const TERMINAL_JOB_STATUSES = new Set(["succeeded", "partial_success", "failed", "cancelled"]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

interface RetranslateJobPollOptions {
  getProcessingJob: (jobId: string) => Promise<ProcessingJobRead>;
  waitForNextPoll?: (ms: number) => Promise<void>;
}

export async function waitForSuccessfulRetranslateJob(
  job: ProcessingJobRead,
  { getProcessingJob, waitForNextPoll = wait }: RetranslateJobPollOptions,
): Promise<ProcessingJobRead> {
  let currentJob = job;

  while (!TERMINAL_JOB_STATUSES.has(currentJob.status)) {
    await waitForNextPoll(RETRANSLATE_JOB_POLL_INTERVAL_MS);
    currentJob = await getProcessingJob(job.id);
  }

  if (currentJob.status !== "succeeded") {
    throw new Error(currentJob.error_message || `Translation job ${currentJob.status}.`);
  }

  return currentJob;
}
