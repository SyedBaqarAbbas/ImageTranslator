import type { ProcessingJobRead } from "../types/api";

const RETRANSLATE_JOB_POLL_INTERVAL_MS = 500;
export const RETRANSLATE_JOB_TIMEOUT_MS = 60_000;
export const RETRANSLATE_JOB_TIMEOUT_MESSAGE =
  "Translation is taking longer than expected. You can retry or refresh the page to check the job later.";
const TERMINAL_JOB_STATUSES = new Set(["succeeded", "partial_success", "failed", "cancelled"]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function resolveBeforeTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutJob: ProcessingJobRead, abortRequest: () => void): Promise<T> {
  if (timeoutMs <= 0) {
    abortRequest();
    return Promise.reject(new RetranslateJobPollingTimeoutError(timeoutJob));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      abortRequest();
      reject(new RetranslateJobPollingTimeoutError(timeoutJob));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export class RetranslateJobPollingTimeoutError extends Error {
  readonly jobId: string;
  readonly lastStatus: string;

  constructor(job: ProcessingJobRead) {
    super(RETRANSLATE_JOB_TIMEOUT_MESSAGE);
    this.name = "RetranslateJobPollingTimeoutError";
    this.jobId = job.id;
    this.lastStatus = job.status;
  }
}

export function isRetranslateJobPollingTimeoutError(error: unknown): error is RetranslateJobPollingTimeoutError {
  return error instanceof RetranslateJobPollingTimeoutError;
}

interface RetranslateJobPollOptions {
  getProcessingJob: (jobId: string, options?: { signal?: AbortSignal }) => Promise<ProcessingJobRead>;
  waitForNextPoll?: (ms: number) => Promise<void>;
  getNow?: () => number;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export async function waitForSuccessfulRetranslateJob(
  job: ProcessingJobRead,
  {
    getProcessingJob,
    waitForNextPoll = wait,
    getNow = () => Date.now(),
    pollIntervalMs = RETRANSLATE_JOB_POLL_INTERVAL_MS,
    timeoutMs = RETRANSLATE_JOB_TIMEOUT_MS,
  }: RetranslateJobPollOptions,
): Promise<ProcessingJobRead> {
  let currentJob = job;
  const startedAt = getNow();

  while (!TERMINAL_JOB_STATUSES.has(currentJob.status)) {
    const remainingBeforePollMs = timeoutMs - (getNow() - startedAt);
    if (remainingBeforePollMs <= 0) {
      throw new RetranslateJobPollingTimeoutError(currentJob);
    }

    await waitForNextPoll(Math.min(pollIntervalMs, remainingBeforePollMs));

    const remainingBeforeRequestMs = timeoutMs - (getNow() - startedAt);
    if (remainingBeforeRequestMs <= 0) {
      throw new RetranslateJobPollingTimeoutError(currentJob);
    }

    const requestController = new AbortController();
    currentJob = await resolveBeforeTimeout(
      getProcessingJob(job.id, { signal: requestController.signal }),
      remainingBeforeRequestMs,
      currentJob,
      () => requestController.abort(),
    );
  }

  if (currentJob.status !== "succeeded") {
    throw new Error(currentJob.error_message || `Translation job ${currentJob.status}.`);
  }

  return currentJob;
}
