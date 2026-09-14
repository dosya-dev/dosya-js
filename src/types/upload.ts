/**
 * Anything `upload.file()` can read bytes from. Blobs (and `File`) are sliced
 * per part, never read whole. A `ReadableStream` is consumed once, in order:
 * it is buffered for a single-request upload (at most 50 MiB) and read part by
 * part for a multipart upload.
 */
export type UploadSource =
  | File
  | Blob
  | ArrayBuffer
  | Uint8Array
  | ReadableStream<Uint8Array>;

/** Bytes that can be sent in one batch request (no streams). */
export type UploadBatchSource = Blob | ArrayBuffer | Uint8Array;

/** Source dates, as unix seconds or a `Date`. */
export type UploadTimestamp = number | Date;

export interface UploadParams {
  workspaceId: string;
  fileName: string;
  /**
   * Size in bytes. Optional when `body` is a Blob/File, ArrayBuffer or
   * Uint8Array (defaults to its length); required for a `ReadableStream`.
   * When both are known they must match, or the upload throws before init.
   */
  fileSize?: number;
  /**
   * Echoed back by init only. The server derives the stored MIME type from the
   * file name's extension, so this does not change what the file is served as.
   */
  mimeType?: string;
  /** @deprecated Ignored by the server since 2026-09-07 and no longer sent: files land in the workspace's own region. */
  region?: string;
  /** Destination folder; omit or null for the workspace root (or your confined folder). */
  folderId?: string | null;
  /** Upload as a new version of this file. */
  fileId?: string | null;
  /**
   * Optimistic concurrency: the version you last saw of the file being
   * replaced (the explicit `fileId`, or the same-name file that would be
   * adopted). A stale value fails with 409 `code: "version_conflict"` and
   * `details.current_version`.
   */
  expectedVersion?: number;
  /**
   * Hex SHA-256 of the bytes. Sent as `X-Dosya-Sha256` on a single-request
   * upload (files up to 50 MiB) and verified server-side: a mismatch is 400
   * `code: "hash_mismatch"`. Multipart uploads cannot be verified by the
   * server, so it is not sent there (`file.hashVerified` is then false).
   */
  sha256?: string;
  /**
   * Compute the SHA-256 with WebCrypto and send it, on the single-request path
   * only (where the bytes are in memory anyway). Ignored for multipart uploads.
   */
  computeSha256?: boolean;
  /** Original modification time, stored as the file's source date. */
  sourceModifiedAt?: UploadTimestamp;
  /** Original creation time. */
  sourceCreatedAt?: UploadTimestamp;
  /** Parts in flight for a multipart upload. Default 3. Streams always use 1. */
  concurrency?: number;
  body: UploadSource;
  onProgress?: (progress: UploadProgress) => void;
  abortSignal?: AbortSignal;
}

export interface UploadInitParams {
  workspaceId: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  folderId?: string | null;
  fileId?: string | null;
  expectedVersion?: number;
  /** @deprecated Ignored by the server; not sent. */
  region?: string;
  abortSignal?: AbortSignal;
}

export interface UploadResumeOptions {
  onProgress?: (progress: UploadProgress) => void;
  abortSignal?: AbortSignal;
  /** Parts in flight. Default 3. Streams always use 1. */
  concurrency?: number;
  sourceModifiedAt?: UploadTimestamp;
  sourceCreatedAt?: UploadTimestamp;
}

export interface UploadPartOptions {
  abortSignal?: AbortSignal;
}

export interface UploadPartResult {
  partNumber: number;
  etag: string;
  /** Present on a fresh part. */
  totalParts?: number | null;
  /** True when the server already had this part (the request is idempotent). */
  alreadyUploaded?: boolean;
}

export interface UploadCompleteOptions {
  sourceModifiedAt?: UploadTimestamp;
  sourceCreatedAt?: UploadTimestamp;
  abortSignal?: AbortSignal;
}

export interface UploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  percent: number;
  partsCompleted?: number;
  totalParts?: number;
  status: "initializing" | "uploading" | "completing" | "complete";
}

/** The file row an upload produced. */
export interface UploadedFile {
  id: string;
  name: string;
  /** Bytes the server measured, not the declared size. */
  sizeBytes: number;
  mimeType: string;
  /** Lowercase with the dot (".txt"), or null when the name has none. */
  extension: string | null;
  region: string;
  /** Greater than 1 when a same-name file was adopted as a new version. */
  version: number;
  createdAt: number;
  /** SHA-256 hex of the bytes (single-request uploads); null for multipart. */
  contentHash: string | null;
  /** True only when you sent `sha256` and the bytes matched it. */
  hashVerified: boolean;
  etag: string | null;
}

export interface UploadResult {
  file: UploadedFile;
  sessionId: string;
}

export interface UploadInitResponse {
  sessionId: string;
  uploadUrl: string;
  workspaceId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** "" when the name has no extension. */
  extension: string;
  region: string;
  /** Present for files over 50 MiB (10 MiB parts); null means one PUT. */
  resumable: {
    partSize: number;
    totalParts: number;
    partUploadUrl: string;
    completeUrl: string;
    statusUrl: string;
  } | null;
}

export type UploadSessionStatus = "pending" | "uploading" | "failed" | "complete";

export interface UploadStatusResponse {
  sessionId: string;
  status: UploadSessionStatus;
  /** Declared size; corrected to the counted bytes after completion. */
  sizeBytes: number;
  partSize: number | null;
  totalParts: number | null;
  bytesUploaded: number;
  uploadedParts: number[];
  /** True once at least one part has landed - not "is a multipart session". */
  hasMultipart: boolean;
}

// ── Batch ──

export interface UploadBatchFile {
  name: string;
  /** At most 5 MiB. */
  body: UploadBatchSource;
  folderId?: string | null;
  fileId?: string | null;
  /** Hex SHA-256, verified per entry (a mismatch fails that entry with "hash_mismatch"). */
  sha256?: string;
  expectedVersion?: number;
  sourceModifiedAt?: UploadTimestamp;
  sourceCreatedAt?: UploadTimestamp;
}

export interface UploadBatchParams {
  workspaceId: string;
  /** 1 to 200 files, each at most 5 MiB, at most 100 MiB together. */
  files: UploadBatchFile[];
  abortSignal?: AbortSignal;
}

export type UploadBatchEntryResult =
  | { ok: true; fileId: string; name: string; version: number }
  | {
      ok: false;
      /** Message, or a machine code such as "version_conflict", "hash_mismatch", "folder_locked". */
      error: string;
      /** With "version_conflict". */
      currentVersion?: number;
    };

export interface UploadBatchResult {
  /** One entry per input file, in input order. */
  results: UploadBatchEntryResult[];
}

// ── Many ──

export interface UploadManyFile {
  name: string;
  body: UploadSource;
  /** Required for a ReadableStream; otherwise defaults to the body's length. */
  fileSize?: number;
  folderId?: string | null;
  fileId?: string | null;
  sha256?: string;
  expectedVersion?: number;
  sourceModifiedAt?: UploadTimestamp;
  sourceCreatedAt?: UploadTimestamp;
}

export interface UploadManyParams {
  workspaceId: string;
  files: UploadManyFile[];
  /** Requests in flight (batch requests and single-file uploads). Default 3. */
  concurrency?: number;
  onProgress?: (progress: UploadManyProgress) => void;
  abortSignal?: AbortSignal;
}

export interface UploadManyProgress {
  filesCompleted: number;
  filesFailed: number;
  totalFiles: number;
  /** Bytes of finished files (large files also report within-file progress). */
  bytesUploaded: number;
  totalBytes: number;
}

export type UploadManyResult =
  | {
      ok: true;
      name: string;
      fileId: string;
      version: number;
      /** Full row, for files that went through `upload.file()`. */
      file?: UploadedFile;
    }
  | {
      ok: false;
      /** The input name. */
      name: string;
      error: string;
      /** Machine code when there is one (e.g. "version_conflict", "concurrent_upload_limit"). */
      code?: string;
      currentVersion?: number;
      /** The underlying error for whole-request or transport failures. */
      cause?: unknown;
    };
