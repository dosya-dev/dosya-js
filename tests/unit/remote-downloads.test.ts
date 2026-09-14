import { describe, it, expect, vi } from "vitest";
import { mockApi, ok, fail } from "./_mock.js";
import { RemoteDownloadsResource, DosyaRemoteDownloadError } from "../../src/resources/remote-downloads.js";
import type { RemoteDownloadJob } from "../../src/types/remote-downloads.js";

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rdl_1", url: "https://src.example/a.zip", filename: "a.zip", status: "queued",
    bytes_total: 100, bytes_done: 0, error_code: null, file_id: null, created_at: 1700000000,
    ...overrides,
  };
}

describe("RemoteDownloadsResource", () => {
  it("list() GETs with workspace_id and camelCases jobs", async () => {
    const api = mockApi({ "GET /api/remote-downloads": ok({ jobs: [jobRow({ status: "done", file_id: "file_1", bytes_done: 100 })] }) });
    const { jobs } = await new RemoteDownloadsResource(api.http()).list("ws_1");
    expect(api.calls[0].method).toBe("GET");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    expect(jobs[0]).toEqual({
      id: "rdl_1", url: "https://src.example/a.zip", filename: "a.zip", status: "done",
      bytesTotal: 100, bytesDone: 100, errorCode: null, fileId: "file_1", createdAt: 1700000000,
    });
  });

  it("create() POSTs url/workspace_id/folder_id", async () => {
    const api = mockApi({ "POST /api/remote-downloads": ok({ job: jobRow() }, 201) });
    const { job } = await new RemoteDownloadsResource(api.http()).create({
      workspaceId: "ws_1", url: "https://src.example/a.zip", folderId: "fld_1",
    });
    expect(api.calls[0].method).toBe("POST");
    expect(api.calls[0].body).toEqual({ url: "https://src.example/a.zip", workspace_id: "ws_1", folder_id: "fld_1" });
    expect(job.status).toBe("queued");
    expect(job.bytesTotal).toBe(100);
  });

  it("create() exposes the probe refusal code on DosyaApiError", async () => {
    const api = mockApi({ "POST /api/remote-downloads": fail(400, "This address isn't allowed", { code: "ssrf_blocked" }) });
    await expect(
      new RemoteDownloadsResource(api.http()).create({ workspaceId: "ws_1", url: "http://127.0.0.1/" }),
    ).rejects.toMatchObject({ status: 400, code: "ssrf_blocked" });
    expect(api.calls[0].body).toEqual({ url: "http://127.0.0.1/", workspace_id: "ws_1" });
  });

  it("create() does not retry the daily-cap 429 (no Retry-After)", async () => {
    const api = mockApi({ "POST /api/remote-downloads": [fail(429, "Daily limit of 20 remote downloads reached"), ok({ job: jobRow() })] });
    const http = api.http({ retry: { maxRetries: 3, baseDelay: 1, maxDelay: 50 } });
    await expect(
      new RemoteDownloadsResource(http).create({ workspaceId: "ws_1", url: "https://src.example/a.zip" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(api.calls).toHaveLength(1);
  });

  it("cancel() DELETEs with ?workspace_id, encodes the id, and is never retried", async () => {
    const api = mockApi({ "DELETE /api/remote-downloads/rdl%2F1": [fail(500, "boom"), ok({ cancelled: false, dismissed: true })] });
    const http = api.http({ retry: { maxRetries: 3, baseDelay: 1, maxDelay: 50 } });
    await expect(new RemoteDownloadsResource(http).cancel("rdl/1", "ws_1")).rejects.toMatchObject({ status: 500 });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].path).toBe("/api/remote-downloads/rdl%2F1");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
  });

  it("cancel() returns both flags", async () => {
    const api = mockApi({ "DELETE /api/remote-downloads/rdl_1": ok({ cancelled: true, dismissed: false }) });
    const res = await new RemoteDownloadsResource(api.http()).cancel("rdl_1", "ws_1");
    expect(res).toEqual({ cancelled: true, dismissed: false });
  });

  describe("waitFor()", () => {
    it("polls until done and reports progress", async () => {
      const api = mockApi({
        "GET /api/remote-downloads": [
          ok({ jobs: [jobRow({ id: "rdl_other" }), jobRow({ status: "downloading", bytes_done: 40 })] }),
          ok({ jobs: [jobRow({ status: "finalizing", bytes_done: 100 })] }),
          ok({ jobs: [jobRow({ status: "done", bytes_done: 100, file_id: "file_9" })] }),
        ],
      });
      const seen: RemoteDownloadJob[] = [];
      const job = await new RemoteDownloadsResource(api.http()).waitFor("rdl_1", "ws_1", {
        intervalMs: 1,
        onProgress: (j) => seen.push(j),
      });
      expect(job.fileId).toBe("file_9");
      expect(seen.map((j) => j.status)).toEqual(["downloading", "finalizing", "done"]);
      expect(api.calls).toHaveLength(3);
      expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    });

    it("throws with the job on error", async () => {
      const api = mockApi({ "GET /api/remote-downloads": ok({ jobs: [jobRow({ status: "error", error_code: "http_404" })] }) });
      const err = await new RemoteDownloadsResource(api.http()).waitFor("rdl_1", "ws_1", { intervalMs: 1 }).catch((e) => e);
      expect(err).toBeInstanceOf(DosyaRemoteDownloadError);
      expect(err.message).toContain("http_404");
      expect(err.job.errorCode).toBe("http_404");
    });

    it("throws on cancelled", async () => {
      const api = mockApi({ "GET /api/remote-downloads": ok({ jobs: [jobRow({ status: "cancelled" })] }) });
      await expect(
        new RemoteDownloadsResource(api.http()).waitFor("rdl_1", "ws_1", { intervalMs: 1 }),
      ).rejects.toThrow(/cancelled/);
    });

    it("throws when the job is not listed", async () => {
      const api = mockApi({ "GET /api/remote-downloads": ok({ jobs: [] }) });
      await expect(
        new RemoteDownloadsResource(api.http()).waitFor("rdl_1", "ws_1", { intervalMs: 1 }),
      ).rejects.toBeInstanceOf(DosyaRemoteDownloadError);
    });

    it("stops when the signal aborts during the wait", async () => {
      const api = mockApi({ "GET /api/remote-downloads": ok({ jobs: [jobRow({ status: "downloading" })] }) });
      const controller = new AbortController();
      const onProgress = vi.fn(() => controller.abort(new Error("stop")));
      await expect(
        new RemoteDownloadsResource(api.http()).waitFor("rdl_1", "ws_1", { intervalMs: 10_000, signal: controller.signal, onProgress }),
      ).rejects.toThrow("stop");
      expect(api.calls).toHaveLength(1);
    });
  });
});
