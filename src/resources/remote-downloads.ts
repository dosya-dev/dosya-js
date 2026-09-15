import { seg, type HttpClient } from "../http.js";
import { DosyaError } from "../errors.js";
import type {
  RemoteDownloadJob,
  CreateRemoteDownloadParams,
  CancelRemoteDownloadResult,
  WaitForRemoteDownloadOptions,
} from "../types/remote-downloads.js";

/** Thrown by `remoteDownloads.waitFor()` when the job ends in `error` or `cancelled`, or disappears. */
export class DosyaRemoteDownloadError extends DosyaError {
  /** Last known job state; `undefined` when the job was no longer listed. */
  readonly job?: RemoteDownloadJob;

  constructor(message: string, job?: RemoteDownloadJob) {
    super(message);
    this.name = "DosyaRemoteDownloadError";
    this.job = job;
  }
}

/**
 * Server-side fetches of a public URL into workspace storage. A finished job
 * creates a file and emits a `file.uploaded` webhook.
 */
export class RemoteDownloadsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List the workspace's jobs (every member's), newest first, max 50. Dismissed
   * jobs are omitted. This is also how progress is polled - there is no single-job GET.
   */
  async list(workspaceId: string): Promise<{ jobs: RemoteDownloadJob[] }> {
    return this.http.request({
      method: "GET",
      path: "/api/remote-downloads",
      query: { workspace_id: workspaceId },
    });
  }

  /**
   * Start fetching a URL. Resolves with the `queued` job. Needs a `full` scope key
   * (upload-scope keys are refused), the `upload_files` permission, and a key that
   * is NOT workspace-pinned.
   * Limits: 3 concurrent jobs and 20 jobs per 24h per workspace (429 without
   * `Retry-After`, so never retried). The API probes the URL first; a refusal is a
   * 400 whose `DosyaApiError.code` is `ssrf_blocked`, `not_a_file`, `unknown_size`,
   * `network`, `http_<status>`, `too_large` (over 1 TB when the source supports
   * Range requests and sends an ETag or Last-Modified, otherwise over 10 GiB) or `quota`.
   */
  async create(params: CreateRemoteDownloadParams): Promise<{ job: RemoteDownloadJob }> {
    return this.http.request({
      method: "POST",
      path: "/api/remote-downloads",
      body: {
        url: params.url,
        workspaceId: params.workspaceId,
        folderId: params.folderId,
      },
    });
  }

  /**
   * Cancel an active job, or dismiss a finished one from the list. Only the
   * member who started the job may do this (403). Needs a `full` scope key.
   * Not retried: a replay after a cancel would dismiss the job.
   */
  async cancel(jobId: string, workspaceId: string): Promise<CancelRemoteDownloadResult> {
    return this.http.request({
      method: "DELETE",
      path: `/api/remote-downloads/${seg(jobId)}`,
      query: { workspace_id: workspaceId },
      retry: "never",
    });
  }

  /**
   * Poll `list()` until the job is `done` and resolve with it (`fileId` set).
   * Throws `DosyaRemoteDownloadError` if the job ends in `error` (see
   * `err.job.errorCode`) or `cancelled`, is no longer listed, or `timeoutMs` passes.
   * Abort with `signal`.
   */
  async waitFor(
    jobId: string,
    workspaceId: string,
    options: WaitForRemoteDownloadOptions = {},
  ): Promise<RemoteDownloadJob> {
    const interval = options.intervalMs ?? 2000;
    const deadline = options.timeoutMs !== undefined ? Date.now() + options.timeoutMs : Infinity;
    for (;;) {
      const { jobs } = await this.http.request<{ jobs: RemoteDownloadJob[] }>({
        method: "GET",
        path: "/api/remote-downloads",
        query: { workspace_id: workspaceId },
        signal: options.signal,
      });
      const job = jobs.find((j) => j.id === jobId);
      if (!job) throw new DosyaRemoteDownloadError(`Remote download ${jobId} was not found`);
      options.onProgress?.(job);
      if (job.status === "done") return job;
      if (job.status === "error") {
        throw new DosyaRemoteDownloadError(
          `Remote download ${jobId} failed${job.errorCode ? `: ${job.errorCode}` : ""}`,
          job,
        );
      }
      if (job.status === "cancelled") {
        throw new DosyaRemoteDownloadError(`Remote download ${jobId} was cancelled`, job);
      }
      if (Date.now() + interval > deadline) {
        throw new DosyaRemoteDownloadError(
          `Remote download ${jobId} did not finish within ${options.timeoutMs}ms (last status: ${job.status})`,
          job,
        );
      }
      await this.http.sleep(interval, options.signal);
    }
  }
}
