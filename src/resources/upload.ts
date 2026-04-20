import { DosyaUploadError } from "../errors.js";
import type { HttpClient } from "../http.js";
import type {
  UploadParams,
  UploadProgress,
  UploadResult,
  UploadInitResponse,
  UploadStatusResponse,
  UploadSource,
} from "../types.js";

const CONCURRENCY = 3;

export class UploadResource {
  constructor(private readonly http: HttpClient) {}

  async file(params: UploadParams): Promise<UploadResult> {
    params.onProgress?.({
      bytesUploaded: 0,
      totalBytes: params.fileSize,
      percent: 0,
      status: "initializing",
    });

    const session = await this.init({
      workspaceId: params.workspaceId,
      fileName: params.fileName,
      fileSize: params.fileSize,
      mimeType: params.mimeType,
      region: params.region,
      folderId: params.folderId,
      fileId: params.fileId,
    });

    if (session.resumable) {
      return this.uploadMultipart(
        session.sessionId,
        session.resumable,
        params.body,
        params.fileSize,
        session.mimeType,
        params.onProgress,
        params.abortSignal,
      );
    }

    return this.uploadSingle(
      session.sessionId,
      session.uploadUrl,
      params.body,
      session.mimeType,
      params.fileSize,
      params.onProgress,
      params.abortSignal,
    );
  }

  async resume(
    sessionId: string,
    body: UploadSource,
    options?: {
      onProgress?: (progress: UploadProgress) => void;
      abortSignal?: AbortSignal;
    },
  ): Promise<UploadResult> {
    const st = await this.status(sessionId);

    if (st.status === "complete") {
      throw new DosyaUploadError("Upload session is already complete", sessionId);
    }

    if (!st.hasMultipart || !st.partSize || !st.totalParts) {
      throw new DosyaUploadError(
        "Cannot resume a non-multipart upload session",
        sessionId,
      );
    }

    return this.uploadMultipart(
      sessionId,
      {
        partSize: st.partSize,
        totalParts: st.totalParts,
        partUploadUrl: `/api/upload/${sessionId}/part`,
        completeUrl: `/api/upload/${sessionId}/complete`,
        statusUrl: `/api/upload/${sessionId}/status`,
      },
      body,
      st.sizeBytes,
      "application/octet-stream",
      options?.onProgress,
      options?.abortSignal,
      st.uploadedParts,
    );
  }

  async init(
    params: Omit<UploadParams, "body" | "onProgress" | "abortSignal">,
  ): Promise<UploadInitResponse> {
    return this.http.request({
      method: "POST",
      path: "/api/upload/init",
      body: {
        workspaceId: params.workspaceId,
        fileName: params.fileName,
        fileSize: params.fileSize,
        mimeType: params.mimeType,
        region: params.region,
        folderId: params.folderId,
        fileId: params.fileId,
      },
    });
  }

  async status(sessionId: string): Promise<UploadStatusResponse> {
    return this.http.request({
      method: "GET",
      path: `/api/upload/${sessionId}/status`,
    });
  }

  // ── Private ──

  private async uploadSingle(
    sessionId: string,
    uploadUrl: string,
    body: UploadSource,
    mimeType: string,
    totalBytes: number,
    onProgress?: (progress: UploadProgress) => void,
    signal?: AbortSignal,
  ): Promise<UploadResult> {
    onProgress?.({
      bytesUploaded: 0,
      totalBytes,
      percent: 0,
      status: "uploading",
    });

    const buf = await this.sourceToBuffer(body);

    const result = await this.http.request<{ file: UploadResult["file"] }>({
      method: "PUT",
      path: uploadUrl,
      rawBody: buf,
      headers: { "Content-Type": mimeType },
      signal,
    });

    onProgress?.({
      bytesUploaded: totalBytes,
      totalBytes,
      percent: 100,
      status: "complete",
    });

    return { file: result.file, sessionId };
  }

  private async uploadMultipart(
    sessionId: string,
    resumable: NonNullable<UploadInitResponse["resumable"]>,
    body: UploadSource,
    totalBytes: number,
    mimeType: string,
    onProgress?: (progress: UploadProgress) => void,
    signal?: AbortSignal,
    alreadyUploaded: number[] = [],
  ): Promise<UploadResult> {
    const { partSize, totalParts, partUploadUrl, completeUrl } = resumable;
    const uploadedSet = new Set(alreadyUploaded);
    let bytesUploaded = alreadyUploaded.length * partSize;
    if (bytesUploaded > totalBytes) bytesUploaded = totalBytes;

    onProgress?.({
      bytesUploaded,
      totalBytes,
      percent: Math.round((bytesUploaded / totalBytes) * 100),
      partsCompleted: uploadedSet.size,
      totalParts,
      status: "uploading",
    });

    const allBytes = await this.sourceToBuffer(body);
    const parts: Array<{ partNumber: number; chunk: Uint8Array }> = [];

    for (let i = 1; i <= totalParts; i++) {
      if (uploadedSet.has(i)) continue;
      const start = (i - 1) * partSize;
      const end = Math.min(start + partSize, allBytes.byteLength);
      parts.push({
        partNumber: i,
        chunk: new Uint8Array(allBytes.slice(start, end)),
      });
    }

    // Upload parts with concurrency pool
    let partIdx = 0;

    const uploadPart = async (): Promise<void> => {
      while (partIdx < parts.length) {
        if (signal?.aborted) throw new DOMException("Upload aborted", "AbortError");

        const idx = partIdx++;
        const part = parts[idx];

        let lastErr: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await this.http.request({
              method: "PUT",
              path: `${partUploadUrl}/${part.partNumber}`,
              rawBody: part.chunk as unknown as BodyInit,
              headers: { "Content-Type": mimeType },
              signal,
            });
            break;
          } catch (err) {
            lastErr = err;
            if (err instanceof DOMException && err.name === "AbortError") throw err;
            if (attempt === 2) {
              throw new DosyaUploadError(
                `Failed to upload part ${part.partNumber} after 3 attempts: ${lastErr}`,
                sessionId,
                part.partNumber,
              );
            }
            await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          }
        }

        uploadedSet.add(part.partNumber);
        bytesUploaded = Math.min(uploadedSet.size * partSize, totalBytes);

        onProgress?.({
          bytesUploaded,
          totalBytes,
          percent: Math.round((bytesUploaded / totalBytes) * 100),
          partsCompleted: uploadedSet.size,
          totalParts,
          status: "uploading",
        });
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, parts.length) },
      () => uploadPart(),
    );
    await Promise.all(workers);

    // Complete
    onProgress?.({
      bytesUploaded: totalBytes,
      totalBytes,
      percent: 99,
      partsCompleted: totalParts,
      totalParts,
      status: "completing",
    });

    const result = await this.http.request<{ file: UploadResult["file"] }>({
      method: "POST",
      path: completeUrl,
      signal,
    });

    onProgress?.({
      bytesUploaded: totalBytes,
      totalBytes,
      percent: 100,
      partsCompleted: totalParts,
      totalParts,
      status: "complete",
    });

    return { file: result.file, sessionId };
  }

  private async sourceToBuffer(source: UploadSource): Promise<ArrayBuffer> {
    if (source instanceof ArrayBuffer) return source;
    if (source instanceof Uint8Array) {
      const copy = new ArrayBuffer(source.byteLength);
      new Uint8Array(copy).set(source);
      return copy;
    }
    if (typeof Blob !== "undefined" && source instanceof Blob) {
      return source.arrayBuffer();
    }
    if (source instanceof ReadableStream) {
      return this.streamToBuffer(source);
    }
    // Fallback for anything with arrayBuffer()
    if ("arrayBuffer" in source && typeof source.arrayBuffer === "function") {
      return (source as Blob).arrayBuffer();
    }
    throw new Error(`Unsupported upload source type: ${typeof source}`);
  }

  private async streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.byteLength;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return result.buffer;
  }
}
