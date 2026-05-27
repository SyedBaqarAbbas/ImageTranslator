import type { ProcessingJobRead } from "../types/api";

const RETRANSLATE_JOB_POLL_INTERVAL_MS = 500;
export const RETRANSLATE_JOB_TIMEOUT_MS = 60_000;
export const RETRANSLATE_JOB_TIMEOUT_MESSAGE =
  "Translation is taking longer than expected. You can retry or refresh the page to check the job later.";
export const OCR_JOB_TIMEOUT_MESSAGE =
  "OCR is taking longer than expected. You can retry or refresh the page to check the job later.";
const TERMINAL_JOB_STATUSES = new Set(["succeeded", "partial_success", "failed", "cancelled"]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function resolveBeforeTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutJob: ProcessingJobRead,
  abortRequest: () => void,
  timeoutErrorForJob: (job: ProcessingJobRead) => Error,
): Promise<T> {
  if (timeoutMs <= 0) {
    abortRequest();
    return Promise.reject(timeoutErrorForJob(timeoutJob));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      abortRequest();
      reject(timeoutErrorForJob(timeoutJob));
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

export class OcrJobPollingTimeoutError extends Error {
  readonly jobId: string;
  readonly lastStatus: string;

  constructor(job: ProcessingJobRead) {
    super(OCR_JOB_TIMEOUT_MESSAGE);
    this.name = "OcrJobPollingTimeoutError";
    this.jobId = job.id;
    this.lastStatus = job.status;
  }
}

export function isRetranslateJobPollingTimeoutError(error: unknown): error is RetranslateJobPollingTimeoutError {
  return error instanceof RetranslateJobPollingTimeoutError;
}

export function isOcrJobPollingTimeoutError(error: unknown): error is OcrJobPollingTimeoutError {
  return error instanceof OcrJobPollingTimeoutError;
}

interface RetranslateJobPollOptions {
  getProcessingJob: (jobId: string, options?: { signal?: AbortSignal }) => Promise<ProcessingJobRead>;
  waitForNextPoll?: (ms: number) => Promise<void>;
  getNow?: () => number;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

async function waitForSuccessfulJob(
  job: ProcessingJobRead,
  {
    getProcessingJob,
    waitForNextPoll = wait,
    getNow = () => Date.now(),
    pollIntervalMs = RETRANSLATE_JOB_POLL_INTERVAL_MS,
    timeoutMs = RETRANSLATE_JOB_TIMEOUT_MS,
  }: RetranslateJobPollOptions,
  timeoutErrorForJob: (job: ProcessingJobRead) => Error,
  failureLabel: string,
): Promise<ProcessingJobRead> {
  let currentJob = job;
  const startedAt = getNow();

  while (!TERMINAL_JOB_STATUSES.has(currentJob.status)) {
    const remainingBeforePollMs = timeoutMs - (getNow() - startedAt);
    if (remainingBeforePollMs <= 0) {
      throw timeoutErrorForJob(currentJob);
    }

    await waitForNextPoll(Math.min(pollIntervalMs, remainingBeforePollMs));

    const remainingBeforeRequestMs = timeoutMs - (getNow() - startedAt);
    if (remainingBeforeRequestMs <= 0) {
      throw timeoutErrorForJob(currentJob);
    }

    const requestController = new AbortController();
    currentJob = await resolveBeforeTimeout(
      getProcessingJob(job.id, { signal: requestController.signal }),
      remainingBeforeRequestMs,
      currentJob,
      () => requestController.abort(),
      timeoutErrorForJob,
    );
  }

  if (currentJob.status !== "succeeded") {
    throw new Error(currentJob.error_message || `${failureLabel} job ${currentJob.status}.`);
  }

  return currentJob;
}

export async function waitForSuccessfulRetranslateJob(
  job: ProcessingJobRead,
  options: RetranslateJobPollOptions,
): Promise<ProcessingJobRead> {
  return waitForSuccessfulJob(
    job,
    options,
    (currentJob) => new RetranslateJobPollingTimeoutError(currentJob),
    "Translation",
  );
}

export async function waitForSuccessfulOcrJob(
  job: ProcessingJobRead,
  options: RetranslateJobPollOptions,
): Promise<ProcessingJobRead> {
  return waitForSuccessfulJob(
    job,
    options,
    (currentJob) => new OcrJobPollingTimeoutError(currentJob),
    "OCR",
  );
}
