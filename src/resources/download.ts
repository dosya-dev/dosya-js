import type { HttpClient } from "../http.js";
import type { DownloadOptions } from "../types.js";

export class DownloadResource {
  constructor(private readonly http: HttpClient) {}

  async getUrl(fileId: string, options?: DownloadOptions): Promise<string> {
    const res = await this.http.requestRaw({
      method: "GET",
      path: `/api/files/${fileId}/download`,
      query: {
        version: options?.version,
        ut: options?.unlockToken,
      },
      rawResponse: true,
    });

    // The server returns a 302 redirect to a presigned R2 URL
    const location = res.headers.get("Location");
    if (location) return location;

    // If redirect was followed automatically, the final URL is the presigned URL
    if (res.url) return res.url;

    throw new Error("Could not extract download URL from response");
  }

  async arrayBuffer(fileId: string, options?: DownloadOptions): Promise<ArrayBuffer> {
    const url = await this.getUrl(fileId, options);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Download failed with status ${res.status}`);
    }
    return res.arrayBuffer();
  }

  async stream(
    fileId: string,
    options?: DownloadOptions,
  ): Promise<ReadableStream<Uint8Array>> {
    const url = await this.getUrl(fileId, options);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Download failed with status ${res.status}`);
    }
    if (!res.body) {
      throw new Error("Response body is null — streaming not supported");
    }
    return res.body;
  }

  async raw(
    fileId: string,
    options?: DownloadOptions,
  ): Promise<Response> {
    return this.http.requestRaw({
      method: "GET",
      path: `/api/files/${fileId}/raw`,
      query: {
        version: options?.version,
        ut: options?.unlockToken,
      },
    });
  }
}
