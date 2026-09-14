export type RemoteDownloadStatus =
  | "queued"
  | "downloading"
  | "finalizing"
  | "done"
  | "error"
  | "cancelled";

/**
 * Why a job failed (`job.errorCode`), or why `create()` was refused
 * (`DosyaApiError.code`). `http_<n>` is the status the source server answered.
 * `workspace_moving` is transient: the job waits instead of failing.
 */
export type RemoteDownloadErrorCode =
  | "ssrf_blocked"
  | "not_a_file"
  | "unknown_size"
  | "too_large"
  | "quota"
  | "workspace_moving"
  | "source_changed"
  | "network"
  | `http_${number}`;

export interface RemoteDownloadJob {
  /** `rdl_...` */
  id: string;
  url: string;
  filename: string;
  status: RemoteDownloadStatus;
  bytesTotal: number;
  bytesDone: number;
  errorCode: RemoteDownloadErrorCode | null;
  /** The created file's id once `status` is `done`. */
  fileId: string | null;
  createdAt: number;
}

export interface CreateRemoteDownloadParams {
  workspaceId: string;
  /** Direct link to the file. */
  url: string;
  /** Destination folder; workspace root when omitted (or the member's anchor folder when folder-confined). */
  folderId?: string | null;
}

export interface CancelRemoteDownloadResult {
  /** `true` when an active job was stopped. `false` if it finished during the race. */
  cancelled: boolean;
  /** `true` when a finished job was removed from the list instead. */
  dismissed: boolean;
}

export interface WaitForRemoteDownloadOptions {
  /** Poll interval in milliseconds. Default 2000. */
  intervalMs?: number;
  signal?: AbortSignal;
  /** Called after every poll with the latest job state. */
  onProgress?: (job: RemoteDownloadJob) => void;
  /**
   * Give up after this many milliseconds with a DosyaRemoteDownloadError that
   * carries the last job state. Jobs whose worker died stay `queued` or
   * `downloading`, so set this for unattended code. Default: no limit.
   */
  timeoutMs?: number;
}
