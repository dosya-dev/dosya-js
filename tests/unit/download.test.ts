import { describe, it, expect } from "vitest";
import { mockApi, ok, fail } from "./_mock.js";
import { DownloadResource } from "../../src/resources/download.js";
import { DosyaApiError } from "../../src/errors.js";
import type { ThumbnailWidth } from "../../src/types/download.js";

const LINK = { url: "https://storage.test/bucket/obj?X-Amz-Signature=abc", size: 5, name: "a.txt", region: "apac" };

describe("download.getUrl()", () => {
  it("reads the bare JSON download-url response and computes expiresAt", async () => {
    const api = mockApi({ "GET /api/files/f%2F1/download-url": { body: LINK } });
    const before = Math.floor(Date.now() / 1000);
    const link = await new DownloadResource(api.http()).getUrl("f/1", { version: 2, unlockToken: "tok", ttl: 900 });

    expect(api.calls[0].query).toEqual({ version: "2", ut: "tok", ttl: "900" });
    expect(link).toMatchObject(LINK);
    expect(link.expiresAt).toBeGreaterThanOrEqual(before + 900);
    expect(link.expiresAt).toBeLessThanOrEqual(before + 901);
  });

  it("mirrors the server's ttl clamp", async () => {
    const api = mockApi({ "GET /api/files/f1/download-url": { body: LINK } });
    const download = new DownloadResource(api.http());
    const now = Math.floor(Date.now() / 1000);
    expect((await download.getUrl("f1")).expiresAt - now).toBeLessThanOrEqual(301);
    expect((await download.getUrl("f1", { ttl: 99_999 })).expiresAt - now).toBeLessThanOrEqual(3601);
    expect((await download.getUrl("f1", { ttl: 99_999 })).expiresAt - now).toBeGreaterThanOrEqual(3600);
    expect(api.calls[0].query).toEqual({});
  });

  it("surfaces API errors instead of returning the endpoint URL", async () => {
    const api = mockApi({
      "GET /api/files/f1/download-url": fail(403, "This file is view-only and cannot be downloaded"),
    });
    const err = await new DownloadResource(api.http()).getUrl("f1").catch((e) => e);
    expect(err).toBeInstanceOf(DosyaApiError);
    expect(err.status).toBe(403);
    expect(err.errorMessage).toMatch(/view-only/);
  });
});

describe("download bytes", () => {
  it("fetches the presigned URL without the API key and passes Range", async () => {
    const api = mockApi({
      "GET /api/files/f1/download-url": { body: LINK },
      "GET /bucket/obj": { status: 206, body: new Uint8Array([2, 3]) },
    });
    const download = new DownloadResource(api.http());
    const buf = await download.arrayBuffer("f1", { range: { start: 1, end: 2 } });

    expect(Array.from(new Uint8Array(buf))).toEqual([2, 3]);
    const storage = api.calls[1];
    expect(storage.headers.authorization).toBeUndefined();
    expect(storage.headers.range).toBe("bytes=1-2");
    expect(api.calls[0].headers.authorization).toBe("Bearer dos_test");
  });

  it("returns a Blob and a stream", async () => {
    const api = mockApi({
      "GET /api/files/f1/download-url": { body: LINK },
      "GET /bucket/obj": { body: new Uint8Array([1, 2, 3]) },
    });
    const download = new DownloadResource(api.http());
    expect((await download.blob("f1")).size).toBe(3);
    const stream = await download.stream("f1", { range: { start: 1 } });
    expect(stream).toBeInstanceOf(ReadableStream);
    expect(api.calls[3].headers.range).toBe("bytes=1-");
  });

  it("surfaces a storage error with its status", async () => {
    const api = mockApi({
      "GET /api/files/f1/download-url": { body: LINK },
      "GET /bucket/obj": { status: 403, body: "<Error>SignatureDoesNotMatch</Error>" },
    });
    const err = await new DownloadResource(api.http()).arrayBuffer("f1").catch((e) => e);
    expect(err).toBeInstanceOf(DosyaApiError);
    expect(err.status).toBe(403);
  });

  it("rejects an invalid range before any request", async () => {
    const api = mockApi({});
    await expect(new DownloadResource(api.http()).arrayBuffer("f1", { range: { start: 5, end: 2 } })).rejects.toThrow(
      TypeError,
    );
    expect(api.calls).toHaveLength(0);
  });
});

describe("download.raw() and thumbnail()", () => {
  it("sends Range, If-None-Match and query", async () => {
    const api = mockApi({ "GET /api/files/f%201/raw": { status: 206, body: new Uint8Array([1]) } });
    const res = await new DownloadResource(api.http()).raw("f 1", {
      version: 3,
      unlockToken: "u",
      range: { start: 0, end: 0 },
      ifNoneMatch: '"e1"',
    });
    expect(res.status).toBe(206);
    expect(api.calls[0].query).toEqual({ version: "3", ut: "u" });
    expect(api.calls[0].headers.range).toBe("bytes=0-0");
    expect(api.calls[0].headers["if-none-match"]).toBe('"e1"');
  });

  it("throws DosyaApiError for a refused raw read", async () => {
    const api = mockApi({ "GET /api/files/f1/raw": fail(404, "File not found") });
    await expect(new DownloadResource(api.http()).raw("f1")).rejects.toBeInstanceOf(DosyaApiError);
  });

  it("requests a thumbnail with a valid width only", async () => {
    const api = mockApi({ "GET /api/files/f1/thumb": { body: new Uint8Array([9]), headers: { "Content-Type": "image/webp" } } });
    const download = new DownloadResource(api.http());
    const res = await download.thumbnail("f1", { width: 256, version: 2 });
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(api.calls[0].query).toEqual({ w: "256", version: "2" });
    await expect(download.thumbnail("f1", { width: 300 as ThumbnailWidth })).rejects.toThrow(TypeError);
    expect(api.calls).toHaveLength(1);
  });
});

describe("download.archive()", () => {
  it("posts snake_case ids and returns the streamed response", async () => {
    const api = mockApi({
      "POST /api/files/download-archive": { body: new Uint8Array([0x50, 0x4b]), headers: { "Content-Type": "application/zip" } },
    });
    const res = await new DownloadResource(api.http()).archive({ folderIds: ["fld_1"] });
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(api.calls[0].body).toEqual({ folder_ids: ["fld_1"] });
  });

  it("requires at least one id", async () => {
    const api = mockApi({});
    const download = new DownloadResource(api.http());
    await expect(download.archive({})).rejects.toThrow(TypeError);
    await expect(download.archive({ fileIds: [], folderIds: [] })).rejects.toThrow(TypeError);
    expect(api.calls).toHaveLength(0);
  });
});

describe("download.archiveEntries() and archiveEntry()", () => {
  it("reads the bare JSON listing", async () => {
    const listing = {
      archiveSize: 100,
      totalEntries: 1,
      truncated: false,
      entries: [{ i: 0, name: "a.txt", size: 3, csize: 3, method: 0, dir: false, encrypted: false, mtime: null }],
    };
    const api = mockApi({ "GET /api/files/f1/archive": { body: listing } });
    const res = await new DownloadResource(api.http()).archiveEntries("f1", { unlockToken: "u" });
    expect(res).toEqual(listing);
    expect(api.calls[0].query).toEqual({ ut: "u" });
  });

  it("streams one entry by index", async () => {
    const api = mockApi({ "GET /api/files/f1/archive/entry": { body: "abc" } });
    const download = new DownloadResource(api.http());
    const res = await download.archiveEntry("f1", 0, { download: true });
    expect(await res.text()).toBe("abc");
    expect(api.calls[0].query).toEqual({ i: "0", dl: "1" });
    await expect(download.archiveEntry("f1", -1)).rejects.toThrow(TypeError);
  });

  it("surfaces archive errors", async () => {
    const api = mockApi({ "GET /api/files/f1/archive": fail(415, "This file is not a zip archive.") });
    const err = await new DownloadResource(api.http()).archiveEntries("f1").catch((e) => e);
    expect(err.status).toBe(415);
  });
});
