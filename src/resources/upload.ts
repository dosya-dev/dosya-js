import { DosyaApiError, DosyaNetworkError, DosyaUploadError } from "../errors.js";
import { seg } from "../http.js";
import { getSubtle } from "../crypto.js";
import type { HttpClient } from "../http.js";
import type {
  UploadBatchEntryResult,
  UploadBatchParams,
  UploadBatchResult,
  UploadBatchSource,
  UploadCompleteOptions,
  UploadedFile,
  UploadInitParams,
  UploadInitResponse,
  UploadManyFile,
  UploadManyParams,
  UploadManyResult,
  UploadParams,
  UploadPartOptions,
  UploadPartResult,
  UploadProgress,
  UploadResult,
  UploadResumeOptions,
  UploadSource,
  UploadStatusResponse,
  UploadTimestamp,
} from "../types/upload.js";

const MIB = 1024 * 1024;
const DEFAULT_CONCURRENCY = 3;

/** Server's `MAX_FILES_PER_BATCH`. */
export const BATCH_MAX_FILES = 200;
/** Server's per-file ceiling for the batch door. */
export const BATCH_FILE_MAX_BYTES = 5 * MIB;
/** Server's summed-bytes ceiling per batch request. */
export const BATCH_TOTAL_MAX_BYTES = 100 * MIB;
/**
 * Bytes per batch request that `many()` aims for. Below the server ceiling on
 * purpose: one batch is one unit of failure, so smaller requests lose less.
 */
const MANY_BATCH_TARGET_BYTES = 48 * MIB;

type InitialSession = UploadInitResponse;

interface MultipartJob {
  sessionId: string;
  partSize: number;
  totalParts: number;
  totalBytes: number;
  body: UploadSource;
  uploaded: Set<number>;
  concurrency: number;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  complete: UploadCompleteOptions;
}

export class UploadResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Upload one file: init, then a single PUT (up to 50 MiB) or a resumable
   * multipart upload (10 MiB parts, `concurrency` in flight).
   *
   * Requires an `upload` or `full` key scope and the role's upload permissions.
   * A same-name file in the destination is adopted as a new version
   * (`file.version > 1`). Retries: a failed single PUT is retried on a fresh
   * session (the old one cannot accept the bytes again); parts and complete
   * are retried on network errors, timeouts, 5xx and 429 with Retry-After.
   * 4xx responses are never retried.
   *
   * Errors: `DosyaApiError` from init/PUT/complete, with `code`
   * `concurrent_upload_limit` (wait for other uploads), `version_conflict`
   * (`details.current_version`), `hash_mismatch` or `folder_locked`.
   * A part that keeps failing throws `DosyaUploadError` carrying `sessionId`
   * and `partNumber` - pass the session id to `resume()`.
   */
  async file(params: UploadParams): Promise<UploadResult> {
    const size = resolveSize(params.body, params.fileSize);
    const concurrency = resolveConcurrency(params.concurrency);
    const signal = params.abortSignal;
    const onProgress = params.onProgress;
    if (params.sha256 !== undefined) assertSha256(params.sha256);

    onProgress?.(progress(0, size, "initializing"));

    const initParams: UploadInitParams = {
      workspaceId: params.workspaceId,
      fileName: params.fileName,
      fileSize: size,
      mimeType: params.mimeType,
      folderId: params.folderId,
      fileId: params.fileId,
      expectedVersion: params.expectedVersion,
      abortSignal: signal,
    };
    const session = await this.init(initParams);
    const complete: UploadCompleteOptions = {
      sourceModifiedAt: params.sourceModifiedAt,
      sourceCreatedAt: params.sourceCreatedAt,
      abortSignal: signal,
    };

    if (session.resumable) {
      return this.runMultipart({
        sessionId: session.sessionId,
        partSize: session.resumable.partSize,
        totalParts: session.resumable.totalParts,
        totalBytes: size,
        body: params.body,
        uploaded: new Set(),
        concurrency,
        onProgress,
        signal,
        complete,
      });
    }

    return this.runSingle(session, initParams, params, size, concurrency, complete);
  }

  /**
   * Continue a multipart session: re-sends only the parts the server lacks,
   * then completes. `body` must be the same bytes (its length must equal the
   * session's size). Single-request sessions (files up to 50 MiB) cannot be
   * resumed - start a new upload.
   */
  async resume(sessionId: string, body: UploadSource, options: UploadResumeOptions = {}): Promise<UploadResult> {
    const concurrency = resolveConcurrency(options.concurrency);
    const st = await this.status(sessionId);

    if (st.status === "complete") {
      throw new DosyaUploadError(
        "Upload session is already complete; the file exists but the session does not report its id",
        sessionId,
      );
    }
    if (!st.partSize || !st.totalParts) {
      throw new DosyaUploadError(
        "Cannot resume a single-request upload session; start a new upload",
        sessionId,
      );
    }
    const known = sourceLength(body);
    if (known !== undefined && known !== st.sizeBytes) {
      throw new TypeError(
        `body is ${known} bytes but upload session ${sessionId} expects ${st.sizeBytes}`,
      );
    }

    return this.runMultipart({
      sessionId,
      partSize: st.partSize,
      totalParts: st.totalParts,
      totalBytes: st.sizeBytes,
      body,
      uploaded: new Set(st.uploadedParts.filter((n) => n >= 1 && n <= st.totalParts!)),
      concurrency,
      onProgress: options.onProgress,
      signal: options.abortSignal,
      complete: {
        sourceModifiedAt: options.sourceModifiedAt,
        sourceCreatedAt: options.sourceCreatedAt,
        abortSignal: options.abortSignal,
      },
    });
  }

  /**
   * Open an upload session. Files over 50 MiB get `resumable` part info.
   * `region` is ignored by the server and not sent; `mimeType` is echoed only.
   * Refusals: 400 `concurrent_upload_limit`, 409 `version_conflict`,
   * 403 `folder_locked`, 404 "Destination folder not found", 413 size caps.
   */
  async init(params: UploadInitParams): Promise<UploadInitResponse> {
    return this.http.request<UploadInitResponse>({
      method: "POST",
      path: "/api/upload/init",
      body: {
        workspaceId: params.workspaceId,
        fileName: params.fileName,
        fileSize: params.fileSize,
        mimeType: params.mimeType,
        folderId: params.folderId,
        fileId: params.fileId,
        expectedVersion: params.expectedVersion,
      },
      signal: params.abortSignal,
    });
  }

  /** Session state. `hasMultipart` only means a part has landed. Needs an `upload` or `full` key. */
  async status(sessionId: string, options: { abortSignal?: AbortSignal } = {}): Promise<UploadStatusResponse> {
    return this.http.request<UploadStatusResponse>({
      method: "GET",
      path: `/api/upload/${seg(sessionId)}/status`,
      signal: options.abortSignal,
    });
  }

  /**
   * Send one part (1-based) of a multipart session. At most `partSize` bytes;
   * idempotent server-side (`alreadyUploaded`). Not retried here.
   * On a session with no parts yet, send the first part alone and wait for it
   * before sending others: the first part creates the storage upload, and
   * racing parts break the session.
   */
  async uploadPart(
    sessionId: string,
    partNumber: number,
    bytes: UploadBatchSource,
    options: UploadPartOptions = {},
  ): Promise<UploadPartResult> {
    if (!Number.isInteger(partNumber) || partNumber < 1) {
      throw new TypeError(`partNumber must be a positive integer, got ${partNumber}`);
    }
    return this.http.request<UploadPartResult>({
      method: "PUT",
      path: `/api/upload/${seg(sessionId)}/part/${partNumber}`,
      rawBody: bytes as BodyInit,
      headers: { "Content-Type": "application/octet-stream" },
      signal: options.abortSignal,
      timeout: this.http.uploadTimeout,
      retry: "never",
    });
  }

  /**
   * Finish a multipart session after every part is stored. Not retried here.
   * 409 when already complete; 400 when parts are missing.
   */
  async complete(sessionId: string, options: UploadCompleteOptions = {}): Promise<UploadResult> {
    const res = await this.http.request<{ file: UploadedFile & { r2Key?: string } }>({
      method: "POST",
      path: `/api/upload/${seg(sessionId)}/complete`,
      headers: sourceTimeHeaders(options.sourceModifiedAt, options.sourceCreatedAt),
      signal: options.abortSignal,
      // Assembling a large object and committing it can take well over 30 s.
      timeout: this.http.uploadTimeout,
      retry: "never",
    });
    return { file: publicFile(res.file), sessionId };
  }

  /**
   * Upload up to 200 small files (each at most 5 MiB, 100 MiB together) in one
   * request. Limits are checked before sending. Per-file refusals do not throw:
   * each result says `ok` or carries `error` (and `currentVersion` for
   * `version_conflict`). Whole-request failures (permission, workspace pin,
   * network) throw. Never retried, since the request is not idempotent.
   */
  async batch(params: UploadBatchParams): Promise<UploadBatchResult> {
    assertWorkspaceId(params.workspaceId);
    const files = params.files;
    if (!Array.isArray(files) || files.length === 0) {
      throw new TypeError("files must be a non-empty array");
    }
    if (files.length > BATCH_MAX_FILES) {
      throw new RangeError(`A batch holds at most ${BATCH_MAX_FILES} files, got ${files.length}`);
    }

    let total = 0;
    const blobs = files.map((f, i) => {
      if (typeof f.name !== "string" || f.name === "") {
        throw new TypeError(`files[${i}].name is required`);
      }
      if (f.sha256 !== undefined) assertSha256(f.sha256);
      const blob = toBlob(f.body, `files[${i}].body`);
      if (blob.size > BATCH_FILE_MAX_BYTES) {
        throw new RangeError(`files[${i}] (${f.name}) is ${blob.size} bytes; the batch limit is 5 MiB per file`);
      }
      total += blob.size;
      return blob;
    });
    if (total > BATCH_TOTAL_MAX_BYTES) {
      throw new RangeError(`Batch is ${total} bytes; the limit is 100 MiB per request`);
    }

    // FormData bypasses the http layer's key conversion, so snake_case by hand.
    const manifest = {
      workspace_id: params.workspaceId,
      files: files.map((f, i) => ({
        name: f.name,
        folder_id: f.folderId ?? null,
        file_id: f.fileId ?? null,
        field: `f${i}`,
        sha256: f.sha256,
        expected_version: f.expectedVersion,
        source_modified_at: toUnixSeconds(f.sourceModifiedAt),
        source_created_at: toUnixSeconds(f.sourceCreatedAt),
      })),
    };

    const form = new FormData();
    form.append("manifest", JSON.stringify(manifest));
    // The filename matters: without one the server reads a string, not a Blob.
    blobs.forEach((blob, i) => form.append(`f${i}`, blob, `f${i}`));

    const res = await this.http.request<{ results?: RawBatchEntry[] }>({
      method: "POST",
      path: "/api/upload/batch",
      rawBody: form,
      signal: params.abortSignal,
      timeout: this.http.uploadTimeout,
      retry: "never",
    });

    const byField = new Map((res.results ?? []).map((r) => [r.field, r]));
    return {
      results: files.map((_, i): UploadBatchEntryResult => {
        const r = byField.get(`f${i}`);
        if (!r) return { ok: false, error: "The server did not report a result for this file" };
        if (r.ok) return { ok: true, fileId: r.fileId!, name: r.name!, version: r.version! };
        const out: UploadBatchEntryResult = { ok: false, error: r.error ?? "Upload failed" };
        if (typeof r.currentVersion === "number") out.currentVersion = r.currentVersion;
        return out;
      }),
    };
  }

  /**
   * Upload many files, choosing the door per file: Blob/ArrayBuffer/Uint8Array
   * bodies of at most 5 MiB go through `batch()` (up to 200 files and about
   * 48 MiB per request); larger files and streams go through `file()`.
   * Results come back in input order and per-file failures never throw -
   * including a whole batch request failing, which fails each file in it with
   * `cause` set. It throws only for invalid input (before any request) and
   * when `abortSignal` aborts.
   */
  async many(params: UploadManyParams): Promise<UploadManyResult[]> {
    assertWorkspaceId(params.workspaceId);
    if (!Array.isArray(params.files)) throw new TypeError("files must be an array");
    const concurrency = resolveConcurrency(params.concurrency);
    const signal = params.abortSignal;
    const files = params.files;
    const sizes = files.map((f, i) => {
      if (typeof f.name !== "string" || f.name === "") throw new TypeError(`files[${i}].name is required`);
      if (f.sha256 !== undefined) assertSha256(f.sha256);
      return resolveSize(f.body, f.fileSize);
    });
    const results: UploadManyResult[] = new Array(files.length);
    if (files.length === 0) return results;

    const totalBytes = sizes.reduce((a, b) => a + b, 0);
    let finishedBytes = 0;
    let filesCompleted = 0;
    let filesFailed = 0;
    const inFlight = new Map<number, number>();
    const report = () => {
      if (!params.onProgress) return;
      let partial = 0;
      for (const b of inFlight.values()) partial += b;
      params.onProgress({
        filesCompleted,
        filesFailed,
        totalFiles: files.length,
        bytesUploaded: finishedBytes + partial,
        totalBytes,
      });
    };
    const settle = (index: number, result: UploadManyResult) => {
      results[index] = result;
      inFlight.delete(index);
      if (result.ok) {
        filesCompleted++;
        finishedBytes += sizes[index];
      } else {
        filesFailed++;
      }
    };

    // Plan: small in-memory files into batches, the rest one by one.
    type Task = { first: number; indices: number[]; batch: boolean };
    const tasks: Task[] = [];
    let current: number[] = [];
    let currentBytes = 0;
    const flush = () => {
      if (current.length) tasks.push({ first: current[0], indices: current, batch: true });
      current = [];
      currentBytes = 0;
    };
    files.forEach((f, i) => {
      if (isStream(f.body) || sizes[i] > BATCH_FILE_MAX_BYTES) {
        tasks.push({ first: i, indices: [i], batch: false });
        return;
      }
      if (current.length >= BATCH_MAX_FILES || (current.length > 0 && currentBytes + sizes[i] > MANY_BATCH_TARGET_BYTES)) {
        flush();
      }
      current.push(i);
      currentBytes += sizes[i];
    });
    flush();
    tasks.sort((a, b) => a.first - b.first);

    await runPool(tasks, concurrency, async (task) => {
      if (task.batch) {
        try {
          const { results: entries } = await this.batch({
            workspaceId: params.workspaceId,
            files: task.indices.map((i) => toBatchFile(files[i])),
            abortSignal: signal,
          });
          entries.forEach((entry, k) => {
            const i = task.indices[k];
            if (entry.ok) {
              settle(i, { ok: true, name: entry.name, fileId: entry.fileId, version: entry.version });
            } else {
              const failure: UploadManyResult = { ok: false, name: files[i].name, error: entry.error };
              if (/^[a-z][a-z0-9_]*$/.test(entry.error)) failure.code = entry.error;
              if (entry.currentVersion !== undefined) failure.currentVersion = entry.currentVersion;
              settle(i, failure);
            }
          });
        } catch (err) {
          if (signal?.aborted) throw err;
          for (const i of task.indices) settle(i, failureFrom(files[i].name, err));
        }
      } else {
        const i = task.first;
        const f = files[i];
        try {
          const r = await this.file({
            workspaceId: params.workspaceId,
            fileName: f.name,
            fileSize: sizes[i],
            body: f.body,
            folderId: f.folderId,
            fileId: f.fileId,
            sha256: f.sha256,
            expectedVersion: f.expectedVersion,
            sourceModifiedAt: f.sourceModifiedAt,
            sourceCreatedAt: f.sourceCreatedAt,
            abortSignal: signal,
            onProgress: params.onProgress
              ? (p) => {
                  inFlight.set(i, p.bytesUploaded);
                  report();
                }
              : undefined,
          });
          settle(i, { ok: true, name: r.file.name, fileId: r.file.id, version: r.file.version, file: r.file });
        } catch (err) {
          if (signal?.aborted) throw err;
          settle(i, failureFrom(f.name, err));
        }
      }
      report();
    });

    return results;
  }

  // ── Private ──

  private async runSingle(
    first: InitialSession,
    initParams: UploadInitParams,
    params: UploadParams,
    size: number,
    concurrency: number,
    complete: UploadCompleteOptions,
  ): Promise<UploadResult> {
    const signal = params.abortSignal;
    const onProgress = params.onProgress;
    let session = first;

    let body: Blob | Uint8Array | ArrayBuffer;
    try {
      body = await singleBody(params.body, size);
    } catch (err) {
      throw new DosyaUploadError(err instanceof Error ? err.message : String(err), session.sessionId, undefined, { cause: err });
    }
    let sha256 = params.sha256?.toLowerCase();
    if (sha256 === undefined && params.computeSha256) sha256 = await sha256Hex(body);

    const headers: Record<string, string> = {
      "Content-Type": params.mimeType ?? "application/octet-stream",
      ...sourceTimeHeaders(params.sourceModifiedAt, params.sourceCreatedAt),
    };
    if (sha256) headers["X-Dosya-Sha256"] = sha256;

    for (let attempt = 0; ; attempt++) {
      if (session.resumable) {
        // Cannot happen for the same declared size, but never PUT a multipart session.
        return this.runMultipart({
          sessionId: session.sessionId,
          partSize: session.resumable.partSize,
          totalParts: session.resumable.totalParts,
          totalBytes: size,
          body,
          uploaded: new Set(),
          concurrency,
          onProgress,
          signal,
          complete,
        });
      }

      onProgress?.(progress(0, size, "uploading"));
      try {
        const res = await this.http.request<{ file: UploadedFile & { r2Key?: string } }>({
          method: "PUT",
          path: `/api/upload/${seg(session.sessionId)}`,
          rawBody: body as BodyInit,
          headers,
          signal,
          timeout: this.http.uploadTimeout,
          retry: "never",
        });
        onProgress?.(progress(size, size, "complete"));
        return { file: publicFile(res.file), sessionId: session.sessionId };
      } catch (err) {
        if (signal?.aborted) throw err;
        const delay = this.retryDelay(err, attempt);
        if (delay === null) throw err;

        // A dropped connection, a timeout or an edge 5xx may hide a commit that
        // happened (or is still happening). Re-sending would store the bytes
        // again as a new version, so learn the session's outcome first.
        const settled = isPreHandlerRefusal(err)
          ? null
          : await this.settleBeforeRetry(session.sessionId, err, false, signal);

        await this.http.sleep(delay, signal);
        // A session still `pending` never saw the PUT, so it can take it again.
        // Once a PUT has started the server marks the session failed, which
        // answers 409: open a new one.
        if (settled?.status !== "pending") {
          onProgress?.(progress(0, size, "initializing"));
          session = await this.init(initParams);
        }
      }
    }
  }

  private async runMultipart(job: MultipartJob): Promise<UploadResult> {
    const { sessionId, partSize, totalParts, totalBytes, uploaded, onProgress, signal } = job;
    const partLength = (n: number) => Math.max(0, Math.min(partSize, totalBytes - (n - 1) * partSize));

    let bytesDone = 0;
    for (const n of uploaded) bytesDone += partLength(n);
    const emit = (status: UploadProgress["status"]) =>
      onProgress?.({
        ...progress(bytesDone, totalBytes, status),
        partsCompleted: uploaded.size,
        totalParts,
      });
    emit("uploading");

    const send = async (n: number, bytes: UploadBatchSource) => {
      await this.sendPartWithRetry(sessionId, n, bytes, signal);
      if (!uploaded.has(n)) {
        uploaded.add(n);
        bytesDone += partLength(n);
      }
      emit("uploading");
    };

    const missing: number[] = [];
    for (let n = 1; n <= totalParts; n++) if (!uploaded.has(n)) missing.push(n);

    if (isStream(job.body)) {
      // A stream is read once, in order, so parts go one at a time.
      const chunker = new StreamChunker(job.body);
      try {
        for (let n = 1; n <= totalParts; n++) {
          const expected = partLength(n);
          const chunk = await chunker.read(expected);
          if (chunk.byteLength !== expected) {
            throw new DosyaUploadError(
              `Stream ended early: part ${n} has ${chunk.byteLength} of ${expected} bytes (declared size ${totalBytes})`,
              sessionId,
              n,
            );
          }
          if (uploaded.has(n)) continue;
          await send(n, chunk);
        }
        if (!(await chunker.atEnd())) {
          throw new DosyaUploadError(`Stream is longer than the declared size ${totalBytes}`, sessionId);
        }
      } finally {
        chunker.release();
      }
    } else {
      const bytesOf = partSource(job.body, partSize, totalBytes);
      let queue = missing;
      // The first part creates the storage multipart upload and fixes the
      // object key. Parts racing it each create their own, and the losers'
      // etags make the session impossible to complete - so a session with no
      // parts yet gets its first part alone.
      if (uploaded.size === 0 && queue.length > 0) {
        const first = queue[0];
        await this.firstPartWithRetry(sessionId, first, bytesOf(first), signal);
        uploaded.add(first);
        bytesDone += partLength(first);
        emit("uploading");
        queue = queue.slice(1);
      }
      await runPool(queue, job.concurrency, (n) => send(n, bytesOf(n)));
    }

    emit("completing");
    const result = await this.completeWithRetry(sessionId, job.complete);
    bytesDone = totalBytes;
    emit("complete");
    return result;
  }

  private async sendPartWithRetry(
    sessionId: string,
    partNumber: number,
    bytes: UploadBatchSource,
    signal?: AbortSignal,
  ): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.uploadPart(sessionId, partNumber, bytes, { abortSignal: signal });
        return;
      } catch (err) {
        if (signal?.aborted) throw err;
        const delay = this.retryDelay(err, attempt);
        if (delay === null) {
          throw new DosyaUploadError(
            `Failed to upload part ${partNumber}: ${err instanceof Error ? err.message : String(err)}`,
            sessionId,
            partNumber,
            { cause: err },
          );
        }
        await this.http.sleep(delay, signal);
      }
    }
  }

  /**
   * The first part of a fresh session, retried without reopening the race it
   * exists to avoid: an attempt whose response was lost may still be creating
   * the storage multipart upload, and a retry arriving before that is recorded
   * would create a second one. Before each retry, wait until the server shows
   * the part stored (done), or the multipart upload recorded (a retry now
   * reuses it), or polling runs out.
   */
  private async firstPartWithRetry(
    sessionId: string,
    partNumber: number,
    bytes: UploadBatchSource,
    signal?: AbortSignal,
  ): Promise<void> {
    const polls = 6;
    for (let attempt = 0; ; attempt++) {
      try {
        await this.uploadPart(sessionId, partNumber, bytes, { abortSignal: signal });
        return;
      } catch (err) {
        if (signal?.aborted) throw err;
        const delay = this.retryDelay(err, attempt);
        if (delay === null) {
          throw new DosyaUploadError(
            `Failed to upload part ${partNumber}: ${err instanceof Error ? err.message : String(err)}`,
            sessionId,
            partNumber,
            { cause: err },
          );
        }
        if (!isPreHandlerRefusal(err)) {
          for (let i = 0; i <= polls; i++) {
            let st: UploadStatusResponse;
            try {
              st = await this.status(sessionId, { abortSignal: signal });
            } catch (statusErr) {
              if (signal?.aborted) throw statusErr;
              break;
            }
            if (st.uploadedParts.includes(partNumber)) return;
            if (st.hasMultipart || (st.status !== "uploading" && st.status !== "pending")) break;
            if (i < polls) await this.http.sleep(this.http.backoff(i), signal);
          }
        }
        await this.http.sleep(delay, signal);
      }
    }
  }

  private async completeWithRetry(sessionId: string, options: UploadCompleteOptions): Promise<UploadResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.complete(sessionId, options);
      } catch (err) {
        if (options.abortSignal?.aborted) throw err;
        if (
          attempt > 0 &&
          err instanceof DosyaApiError &&
          err.status === 409 &&
          /already complete/i.test(err.errorMessage)
        ) {
          throw new DosyaUploadError(
            "The upload completed on an earlier attempt whose response was lost; the file exists but its id is unknown",
            sessionId,
            undefined,
            { cause: err },
          );
        }
        const delay = this.retryDelay(err, attempt);
        if (delay === null) throw err;
        // Give an attempt that may still be running time to finish before
        // repeating it: a racing second complete can fail a finished session. A
        // session with parts reads `uploading` until complete commits, so after
        // polling it is retried.
        if (!isPreHandlerRefusal(err)) {
          await this.settleBeforeRetry(sessionId, err, true, options.abortSignal);
        }
        await this.http.sleep(delay, options.abortSignal);
      }
    }
  }

  /**
   * Wait until the server has finished handling an attempt whose outcome the
   * client could not see, and return the session's status. Throws when it
   * completed (the file exists) or when its state cannot be read. A session
   * still `uploading` after polling throws for a single-request upload (the PUT
   * may still be storing the file) but is returned for `complete`, because a
   * multipart session reads `uploading` from its first part until it commits.
   */
  private async settleBeforeRetry(
    sessionId: string,
    cause: unknown,
    forComplete: boolean,
    signal?: AbortSignal,
  ): Promise<UploadStatusResponse> {
    const polls = 6;
    for (let i = 0; ; i++) {
      let st: UploadStatusResponse;
      try {
        st = await this.status(sessionId, { abortSignal: signal });
      } catch (err) {
        if (signal?.aborted) throw err;
        throw new DosyaUploadError(
          "Upload failed and its outcome could not be confirmed; not retrying to avoid storing the file twice",
          sessionId,
          undefined,
          { cause },
        );
      }
      if (st.status === "complete") {
        throw new DosyaUploadError(
          "The upload completed but its response was lost; the file exists but its id is unknown",
          sessionId,
          undefined,
          { cause },
        );
      }
      if (st.status !== "uploading") return st;
      if (i >= polls) {
        if (forComplete) return st;
        throw new DosyaUploadError(
          "The server is still processing an earlier attempt; not retrying to avoid storing the file twice",
          sessionId,
          undefined,
          { cause },
        );
      }
      // Backoff from the client's retry settings: about 30 s in total by default.
      await this.http.sleep(this.http.backoff(i), signal);
    }
  }

  /** Delay before the next attempt, or null when `err` must surface. */
  private retryDelay(err: unknown, attempt: number): number | null {
    if (attempt >= this.http.maxRetries) return null;
    if (err instanceof DosyaNetworkError) return this.http.backoff(attempt);
    if (err instanceof DosyaApiError) {
      if (err.retryAfter !== undefined) {
        const ms = err.retryAfter * 1000;
        if (ms > this.http.maxDelay) return null;
        if (err.status === 429 || err.status >= 500) return ms;
        return null;
      }
      // A 429 without Retry-After is a business cap that waiting will not clear.
      if (err.status >= 500) return this.http.backoff(attempt);
    }
    return null;
  }
}

// ── Helpers ──

interface RawBatchEntry {
  field: string;
  ok: boolean;
  fileId?: string;
  name?: string;
  version?: number;
  error?: string;
  currentVersion?: number;
}

function isBlob(v: unknown): v is Blob {
  return typeof Blob !== "undefined" && v instanceof Blob;
}

function isStream(v: unknown): v is ReadableStream<Uint8Array> {
  return typeof ReadableStream !== "undefined" && v instanceof ReadableStream;
}

function sourceLength(body: UploadSource): number | undefined {
  if (isBlob(body)) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (isStream(body)) return undefined;
  throw new TypeError("body must be a Blob, File, ArrayBuffer, Uint8Array or ReadableStream");
}

function resolveSize(body: UploadSource, fileSize: number | undefined): number {
  const known = sourceLength(body);
  if (fileSize === undefined || fileSize === null) {
    if (known === undefined) throw new TypeError("fileSize is required when body is a ReadableStream");
    return known;
  }
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
    throw new TypeError(`fileSize must be a non-negative integer, got ${fileSize}`);
  }
  if (known !== undefined && known !== fileSize) {
    throw new TypeError(`fileSize is ${fileSize} but body is ${known} bytes`);
  }
  return fileSize;
}

function resolveConcurrency(value: number | undefined): number {
  if (value === undefined) return DEFAULT_CONCURRENCY;
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`concurrency must be a positive integer, got ${value}`);
  }
  return value;
}

function assertWorkspaceId(id: unknown): void {
  if (typeof id !== "string" || id.trim() === "") throw new TypeError("workspaceId is required");
}

function assertSha256(value: string): void {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) throw new TypeError("sha256 must be 64 hex characters");
}

function toUnixSeconds(value: UploadTimestamp | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  const ms = value instanceof Date ? value.getTime() : value * 1000;
  if (!Number.isFinite(ms)) return undefined;
  return Math.floor(ms / 1000);
}

function sourceTimeHeaders(mtime?: UploadTimestamp, ctime?: UploadTimestamp): Record<string, string> {
  const headers: Record<string, string> = {};
  const m = toUnixSeconds(mtime);
  const c = toUnixSeconds(ctime);
  if (m !== undefined) headers["X-Dosya-Source-Mtime"] = String(m);
  if (c !== undefined) headers["X-Dosya-Source-Ctime"] = String(c);
  return headers;
}

function progress(bytes: number, total: number, status: UploadProgress["status"]): UploadProgress {
  let percent = total > 0 ? Math.round((bytes / total) * 100) : status === "complete" ? 100 : 0;
  if (status === "complete") percent = 100;
  else if (percent > 99 && status === "completing") percent = 99;
  return { bytesUploaded: bytes, totalBytes: total, percent, status };
}

function publicFile(file: UploadedFile & { r2Key?: string }): UploadedFile {
  const { r2Key: _r2Key, ...rest } = file;
  return {
    ...rest,
    contentHash: rest.contentHash ?? null,
    hashVerified: rest.hashVerified ?? false,
    etag: rest.etag ?? null,
  };
}

function toBlob(body: UploadBatchSource, label: string): Blob {
  if (isBlob(body)) return body;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return new Blob([body as BlobPart]);
  throw new TypeError(`${label} must be a Blob, ArrayBuffer or Uint8Array`);
}

function toBatchFile(f: UploadManyFile) {
  return {
    name: f.name,
    body: f.body as UploadBatchSource,
    folderId: f.folderId,
    fileId: f.fileId,
    sha256: f.sha256,
    expectedVersion: f.expectedVersion,
    sourceModifiedAt: f.sourceModifiedAt,
    sourceCreatedAt: f.sourceCreatedAt,
  };
}

function failureFrom(name: string, err: unknown): UploadManyResult {
  if (err instanceof DosyaApiError) {
    const out: UploadManyResult = { ok: false, name, error: err.errorMessage, cause: err };
    if (err.code) out.code = err.code;
    const cv = err.details.current_version;
    if (typeof cv === "number") out.currentVersion = cv;
    return out;
  }
  if (err instanceof DosyaUploadError && err.cause instanceof DosyaApiError) {
    const inner = failureFrom(name, err.cause);
    return { ...inner, error: err.message, cause: err } as UploadManyResult;
  }
  return { ok: false, name, error: err instanceof Error ? err.message : String(err), cause: err };
}

/** Random-access part bytes for in-memory and Blob sources (Blobs are sliced, never read). */
function partSource(body: UploadSource, partSize: number, total: number): (n: number) => UploadBatchSource {
  const range = (n: number) => {
    const start = (n - 1) * partSize;
    return [start, Math.min(start + partSize, total)] as const;
  };
  if (isBlob(body)) {
    return (n) => {
      const [s, e] = range(n);
      return body.slice(s, e);
    };
  }
  if (body instanceof ArrayBuffer) {
    return (n) => {
      const [s, e] = range(n);
      return new Uint8Array(body, s, e - s);
    };
  }
  if (ArrayBuffer.isView(body)) {
    const view = body as Uint8Array;
    return (n) => {
      const [s, e] = range(n);
      return view.subarray(s, e);
    };
  }
  throw new TypeError("Unsupported upload body");
}

/** The whole body for a single PUT (at most 50 MiB). Streams are buffered and length-checked. */
async function singleBody(body: UploadSource, size: number): Promise<Blob | Uint8Array | ArrayBuffer> {
  if (!isStream(body)) return body as Blob | Uint8Array | ArrayBuffer;
  const chunker = new StreamChunker(body);
  try {
    const bytes = await chunker.read(size);
    if (bytes.byteLength !== size) {
      throw new TypeError(`Stream ended after ${bytes.byteLength} bytes; declared size is ${size}`);
    }
    if (!(await chunker.atEnd())) throw new TypeError(`Stream is longer than the declared size ${size}`);
    return bytes;
  } finally {
    chunker.release();
  }
}

/** A refusal issued by middleware before any handler ran (rate limit with Retry-After). */
function isPreHandlerRefusal(err: unknown): boolean {
  return err instanceof DosyaApiError && err.status === 429 && err.retryAfter !== undefined;
}

async function sha256Hex(body: Blob | Uint8Array | ArrayBuffer): Promise<string> {
  const data = isBlob(body) ? await body.arrayBuffer() : body;
  const digest = await (await getSubtle()).digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reads exact-length chunks from a stream, holding at most one part in memory. */
class StreamChunker {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private pending: Uint8Array = new Uint8Array(0);
  private done = false;

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
  }

  async read(length: number): Promise<Uint8Array> {
    const out = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      if (this.pending.byteLength === 0) {
        if (this.done) break;
        const { done, value } = await this.reader.read();
        if (done) {
          this.done = true;
          break;
        }
        this.pending = value;
        continue;
      }
      const take = Math.min(length - offset, this.pending.byteLength);
      out.set(this.pending.subarray(0, take), offset);
      offset += take;
      this.pending = this.pending.subarray(take);
    }
    return offset === length ? out : out.subarray(0, offset);
  }

  async atEnd(): Promise<boolean> {
    while (this.pending.byteLength === 0) {
      if (this.done) return true;
      const { done, value } = await this.reader.read();
      if (done) {
        this.done = true;
        return true;
      }
      this.pending = value;
    }
    return false;
  }

  release(): void {
    try {
      this.reader.releaseLock();
    } catch {
      // A pending read keeps the lock; nothing more to do.
    }
  }
}

/** Runs `fn` over `items` with at most `limit` in flight; stops starting new work after the first failure. */
async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  let failure: unknown;
  const worker = async () => {
    while (!failed && next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (err) {
        if (!failed) {
          failed = true;
          failure = err;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed) throw failure;
}
