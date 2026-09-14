import { DosyaApiError, DosyaError } from "../errors.js";
import { seg } from "../http.js";
import type { HttpClient } from "../http.js";
import type {
  ArchiveDownloadParams,
  ArchiveEntriesOptions,
  ArchiveEntryOptions,
  ArchiveListing,
  ByteRange,
  DownloadBytesOptions,
  DownloadLink,
  DownloadUrlOptions,
  RawDownloadOptions,
  ThumbnailOptions,
} from "../types/download.js";

const DEFAULT_TTL = 300;
const MAX_TTL = 3600;
const THUMB_WIDTHS: ReadonlySet<number> = new Set([128, 256, 512, 1600]);

export class DownloadResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Presigned download link plus the file's size, name and region.
   * Needs the role's download permission; view-only files are refused (403),
   * `full_lock` files need `unlockToken`. Egress is metered when the link is
   * issued (429 when over the cap).
   */
  async getUrl(fileId: string, options: DownloadUrlOptions = {}): Promise<DownloadLink> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const res = await this.http.request<Omit<DownloadLink, "expiresAt">>({
      method: "GET",
      path: `/api/files/${seg(fileId)}/download-url`,
      query: {
        version: options.version,
        ut: options.unlockToken,
        ttl: options.ttl,
      },
      envelope: false,
      signal: options.abortSignal,
    });
    return {
      url: res.url,
      size: res.size,
      name: res.name,
      region: res.region,
      expiresAt: issuedAt + clampTtl(options.ttl),
    };
  }

  /** Download the file into memory. Same gates as `getUrl()`. */
  async arrayBuffer(fileId: string, options: DownloadBytesOptions = {}): Promise<ArrayBuffer> {
    const res = await this.fetchPresigned(fileId, options);
    return res.arrayBuffer();
  }

  /** Download the file as a Blob. Same gates as `getUrl()`. */
  async blob(fileId: string, options: DownloadBytesOptions = {}): Promise<Blob> {
    const res = await this.fetchPresigned(fileId, options);
    return res.blob();
  }

  /** Stream the file from storage. Same gates as `getUrl()`. */
  async stream(fileId: string, options: DownloadBytesOptions = {}): Promise<ReadableStream<Uint8Array>> {
    const res = await this.fetchPresigned(fileId, options);
    if (!res.body) throw new DosyaError("Response body is null; streaming is not supported by this fetch");
    return res.body;
  }

  /**
   * The file's bytes served inline through the API (`Content-Type` by
   * extension, `ETag`). Supports `range` (206, or 416 thrown as DosyaApiError)
   * and `ifNoneMatch` (304). Viewer semantics: works on view-only files and
   * does not need the download permission.
   */
  async raw(fileId: string, options: RawDownloadOptions = {}): Promise<Response> {
    const headers: Record<string, string> = {};
    if (options.range) headers.Range = rangeHeader(options.range);
    if (options.ifNoneMatch) headers["If-None-Match"] = options.ifNoneMatch;
    return this.http.requestRaw({
      method: "GET",
      path: `/api/files/${seg(fileId)}/raw`,
      query: { version: options.version, ut: options.unlockToken },
      headers,
      signal: options.abortSignal,
    });
  }

  /**
   * A thumbnail (WebP or embedded JPEG). Formats that need no thumbnail, and
   * sources too large to render, redirect to `/raw` and are followed. 415 when
   * the type has no thumbnail.
   */
  async thumbnail(fileId: string, options: ThumbnailOptions): Promise<Response> {
    if (!options || !THUMB_WIDTHS.has(options.width)) {
      throw new TypeError(`width must be one of 128, 256, 512, 1600, got ${options?.width}`);
    }
    return this.http.requestRaw({
      method: "GET",
      path: `/api/files/${seg(fileId)}/thumb`,
      query: { w: options.width, version: options.version, ut: options.unlockToken },
      signal: options.abortSignal,
    });
  }

  /**
   * A streamed ZIP of files (at the archive root) and folders (recursively).
   * Read scope is enough. Locked, hidden and view-only items are left out;
   * limits are 10 000 entries and 5 GiB.
   */
  async archive(params: ArchiveDownloadParams): Promise<Response> {
    const fileIds = params?.fileIds ?? [];
    const folderIds = params?.folderIds ?? [];
    if (!Array.isArray(fileIds) || !Array.isArray(folderIds)) {
      throw new TypeError("fileIds and folderIds must be arrays");
    }
    if (fileIds.length === 0 && folderIds.length === 0) {
      throw new TypeError("archive() needs at least one id in fileIds or folderIds");
    }
    const body: Record<string, string[]> = {};
    if (fileIds.length) body.fileIds = fileIds;
    if (folderIds.length) body.folderIds = folderIds;
    return this.http.requestRaw({
      method: "POST",
      path: "/api/files/download-archive",
      body,
      signal: params.abortSignal,
    });
  }

  /**
   * List the entries of a `.zip` file without downloading it. 415 when the
   * file is not a zip, 413 when its directory is too large to list.
   */
  async archiveEntries(fileId: string, options: ArchiveEntriesOptions = {}): Promise<ArchiveListing> {
    return this.http.request<ArchiveListing>({
      method: "GET",
      path: `/api/files/${seg(fileId)}/archive`,
      query: { version: options.version, ut: options.unlockToken },
      envelope: false,
      signal: options.abortSignal,
    });
  }

  /**
   * Stream one entry of a `.zip` file by its index from `archiveEntries()`.
   * Only stored and deflated, unencrypted entries. `download: true` serves it
   * as an attachment and applies the download gates.
   */
  async archiveEntry(fileId: string, index: number, options: ArchiveEntryOptions = {}): Promise<Response> {
    if (!Number.isInteger(index) || index < 0) {
      throw new TypeError(`index must be a non-negative integer, got ${index}`);
    }
    return this.http.requestRaw({
      method: "GET",
      path: `/api/files/${seg(fileId)}/archive/entry`,
      query: {
        i: index,
        dl: options.download ? 1 : undefined,
        version: options.version,
        ut: options.unlockToken,
      },
      signal: options.abortSignal,
    });
  }

  // ── Private ──

  /** Fetch the presigned URL without the API key (it must never reach storage). */
  private async fetchPresigned(fileId: string, options: DownloadBytesOptions): Promise<Response> {
    const headers: Record<string, string> = {};
    if (options.range) headers.Range = rangeHeader(options.range);
    const link = await this.getUrl(fileId, {
      version: options.version,
      unlockToken: options.unlockToken,
      abortSignal: options.abortSignal,
    });
    const res = await this.http.fetchFn(link.url, { method: "GET", headers, signal: options.abortSignal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new DosyaApiError(res.status, `Download failed with status ${res.status}`, text, {
        method: "GET",
        path: `/api/files/${seg(fileId)}/download-url`,
      });
    }
    return res;
  }
}

function clampTtl(ttl: number | undefined): number {
  if (ttl === undefined) return DEFAULT_TTL;
  const n = Math.trunc(ttl);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL;
  return Math.min(n, MAX_TTL);
}

function rangeHeader(range: ByteRange): string {
  const { start, end } = range;
  if (!Number.isSafeInteger(start) || start < 0) {
    throw new TypeError(`range.start must be a non-negative integer, got ${start}`);
  }
  if (end !== undefined && (!Number.isSafeInteger(end) || end < start)) {
    throw new TypeError(`range.end must be an integer >= start, got ${end}`);
  }
  return `bytes=${start}-${end ?? ""}`;
}
