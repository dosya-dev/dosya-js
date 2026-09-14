export interface DownloadOptions {
  /** A specific version (1-based). Omit for the current one. */
  version?: number;
  /** Unlock token from `files.unlock()`, required for `full_lock` files. */
  unlockToken?: string;
}

/** Inclusive byte range. `end` omitted means "to the end of the file". */
export interface ByteRange {
  start: number;
  end?: number;
}

export interface DownloadUrlOptions extends DownloadOptions {
  /** Link lifetime in seconds. Default 300, max 3600 (the server clamps). */
  ttl?: number;
  abortSignal?: AbortSignal;
}

export interface DownloadLink {
  /** Presigned storage URL. Fetch it without an Authorization header. */
  url: string;
  /** Bytes of the requested version. */
  size: number;
  name: string;
  region: string;
  /** Unix seconds after which `url` stops working (computed client-side from `ttl`). */
  expiresAt: number;
}

export interface DownloadBytesOptions extends DownloadOptions {
  /** Fetch only part of the file (sent as a `Range` header). */
  range?: ByteRange;
  abortSignal?: AbortSignal;
}

export interface RawDownloadOptions extends DownloadOptions {
  range?: ByteRange;
  /** Sent as `If-None-Match`; a match answers 304. */
  ifNoneMatch?: string;
  abortSignal?: AbortSignal;
}

export type ThumbnailWidth = 128 | 256 | 512 | 1600;

export interface ThumbnailOptions extends DownloadOptions {
  width: ThumbnailWidth;
  abortSignal?: AbortSignal;
}

export interface ArchiveDownloadParams {
  /** Files placed at the archive root. */
  fileIds?: string[];
  /** Folders included recursively, keeping their structure. */
  folderIds?: string[];
  abortSignal?: AbortSignal;
}

export interface ArchiveEntriesOptions extends DownloadOptions {
  abortSignal?: AbortSignal;
}

export interface ArchiveEntry {
  /** Index to pass to `archiveEntry()`. */
  i: number;
  name: string;
  /** Uncompressed bytes. */
  size: number;
  /** Compressed bytes. */
  csize: number;
  /** ZIP compression method (0 store, 8 deflate). */
  method: number;
  dir: boolean;
  encrypted: boolean;
  /** Unix seconds from the entry's DOS time, or null. */
  mtime: number | null;
}

export interface ArchiveListing {
  archiveSize: number;
  totalEntries: number;
  /** True when the listing stops before `totalEntries`. */
  truncated: boolean;
  entries: ArchiveEntry[];
}

export interface ArchiveEntryOptions extends DownloadOptions {
  /** Serve as an attachment (applies the download permission and view-only gates). */
  download?: boolean;
  abortSignal?: AbortSignal;
}
