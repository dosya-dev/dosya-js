import { describe, it, expect, vi } from "vitest";
import { mockApi, ok, fail } from "./_mock.js";
import type { MockReply, RecordedCall } from "./_mock.js";
import { UploadResource } from "../../src/resources/upload.js";
import { DosyaApiError, DosyaUploadError } from "../../src/errors.js";
import type { UploadProgress } from "../../src/types/upload.js";

const RETRY = { maxRetries: 2, baseDelay: 1, maxDelay: 50 };

function fileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "file_1",
    name: "a.txt",
    r2_key: "ws_1/file_1/a.txt",
    size_bytes: 5,
    mime_type: "text/plain",
    extension: ".txt",
    region: "apac",
    version: 1,
    created_at: 1_700_000_000,
    content_hash: null,
    hash_verified: false,
    etag: "etag-1",
    ...overrides,
  };
}

function singleInit(sessionId: string, size: number): MockReply {
  return ok(
    {
      session_id: sessionId,
      upload_url: `/api/upload/${sessionId}`,
      workspace_id: "ws_1",
      file_name: "a.txt",
      file_size: size,
      mime_type: "text/plain",
      extension: ".txt",
      region: "apac",
      resumable: null,
    },
    201,
  );
}

function multipartInit(sessionId: string, size: number, partSize: number): MockReply {
  const totalParts = Math.ceil(size / partSize);
  return ok(
    {
      session_id: sessionId,
      upload_url: `/api/upload/${sessionId}`,
      workspace_id: "ws_1",
      file_name: "big.bin",
      file_size: size,
      mime_type: "application/octet-stream",
      extension: ".bin",
      region: "apac",
      resumable: {
        part_size: partSize,
        total_parts: totalParts,
        part_upload_url: `/api/upload/${sessionId}/part`,
        complete_url: `/api/upload/${sessionId}/complete`,
        status_url: `/api/upload/${sessionId}/status`,
      },
    },
    201,
  );
}

function partRoutes(sessionId: string, count: number, handler?: (n: number, call: RecordedCall) => MockReply | Promise<MockReply>) {
  const routes: Record<string, (call: RecordedCall) => MockReply | Promise<MockReply>> = {};
  for (let n = 1; n <= count; n++) {
    routes[`PUT /api/upload/${sessionId}/part/${n}`] = (call) =>
      handler ? handler(n, call) : ok({ part_number: n, etag: `e${n}`, total_parts: count }, 201);
  }
  return routes;
}

const bytes = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 251));

function singleStatus(sessionId: string, status: string) {
  return ok({
    session_id: sessionId, status, size_bytes: 5, part_size: null, total_parts: null,
    bytes_uploaded: 0, uploaded_parts: [], has_multipart: false,
  });
}

describe("upload.file() single request", () => {
  it("sends init allowlist, source-time and sha256 headers, and strips r2Key", async () => {
    const api = mockApi({
      "POST /api/upload/init": singleInit("upl_1", 5),
      "PUT /api/upload/upl_1": ok({ file: fileRow({ content_hash: "ab".repeat(32), hash_verified: true }) }, 201),
    });
    const upload = new UploadResource(api.http());
    const events: UploadProgress[] = [];
    const sha = "AB".repeat(32);

    const result = await upload.file({
      workspaceId: "ws_1",
      fileName: "a.txt",
      body: bytes(5),
      mimeType: "text/plain",
      region: "eu",
      folderId: "fld_1",
      expectedVersion: 3,
      sha256: sha,
      sourceModifiedAt: 1_700_000_123,
      sourceCreatedAt: new Date(1_600_000_000_500),
      onProgress: (p) => events.push(p),
    });

    expect(api.calls[0].body).toEqual({
      workspace_id: "ws_1",
      file_name: "a.txt",
      file_size: 5,
      mime_type: "text/plain",
      folder_id: "fld_1",
      expected_version: 3,
    });
    const put = api.calls[1];
    expect(put.method).toBe("PUT");
    expect(put.path).toBe("/api/upload/upl_1");
    expect(put.headers["x-dosya-sha256"]).toBe(sha.toLowerCase());
    expect(put.headers["x-dosya-source-mtime"]).toBe("1700000123");
    expect(put.headers["x-dosya-source-ctime"]).toBe("1600000000");

    expect(result.sessionId).toBe("upl_1");
    expect(result.file).toEqual({
      id: "file_1",
      name: "a.txt",
      sizeBytes: 5,
      mimeType: "text/plain",
      extension: ".txt",
      region: "apac",
      version: 1,
      createdAt: 1_700_000_000,
      contentHash: "ab".repeat(32),
      hashVerified: true,
      etag: "etag-1",
    });
    expect(result.file).not.toHaveProperty("r2Key");
    expect(events.map((e) => e.status)).toEqual(["initializing", "uploading", "complete"]);
    expect(events.at(-1)!.percent).toBe(100);
  });

  it("computes sha256 with WebCrypto when asked", async () => {
    const api = mockApi({
      "POST /api/upload/init": singleInit("upl_1", 3),
      "PUT /api/upload/upl_1": ok({ file: fileRow() }, 201),
    });
    await new UploadResource(api.http()).file({
      workspaceId: "ws_1",
      fileName: "a.txt",
      body: new TextEncoder().encode("abc"),
      computeSha256: true,
    });
    expect(api.calls[1].headers["x-dosya-sha256"]).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("defaults fileSize from a Blob and throws before init on a mismatch", async () => {
    const api = mockApi({
      "POST /api/upload/init": singleInit("upl_1", 4),
      "PUT /api/upload/upl_1": ok({ file: fileRow() }, 201),
    });
    const upload = new UploadResource(api.http());
    await upload.file({ workspaceId: "ws_1", fileName: "a.txt", body: new Blob(["abcd"]) });
    expect((api.calls[0].body as Record<string, unknown>).file_size).toBe(4);

    const before = api.calls.length;
    await expect(
      upload.file({ workspaceId: "ws_1", fileName: "a.txt", fileSize: 9, body: new Blob(["abcd"]) }),
    ).rejects.toThrow(TypeError);
    await expect(
      upload.file({ workspaceId: "ws_1", fileName: "a.txt", body: new ReadableStream<Uint8Array>() }),
    ).rejects.toThrow(/fileSize is required/);
    expect(api.calls.length).toBe(before);
  });

  it("buffers a stream for the single PUT", async () => {
    const api = mockApi({
      "POST /api/upload/init": singleInit("upl_1", 6),
      "PUT /api/upload/upl_1": ok({ file: fileRow() }, 201),
    });
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1, 2]));
        c.enqueue(new Uint8Array([3, 4, 5, 6]));
        c.close();
      },
    });
    await new UploadResource(api.http()).file({ workspaceId: "ws_1", fileName: "a.txt", fileSize: 6, body: stream });
    expect(Array.from(api.calls[1].rawBody as Uint8Array)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("re-inits a fresh session when the PUT fails with a 5xx", async () => {
    const api = mockApi({
      "POST /api/upload/init": [singleInit("upl_1", 5), singleInit("upl_2", 5)],
      "PUT /api/upload/upl_1": fail(500, "File upload to storage failed"),
      "GET /api/upload/upl_1/status": singleStatus("upl_1", "failed"),
      "PUT /api/upload/upl_2": ok({ file: fileRow() }, 201),
    });
    const result = await new UploadResource(api.http({ retry: RETRY })).file({
      workspaceId: "ws_1",
      fileName: "a.txt",
      body: bytes(5),
    });
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /api/upload/init",
      "PUT /api/upload/upl_1",
      "GET /api/upload/upl_1/status",
      "POST /api/upload/init",
      "PUT /api/upload/upl_2",
    ]);
    expect(result.sessionId).toBe("upl_2");
  });

  it("waits for an attempt the server is still processing, then re-inits once it failed", async () => {
    const api = mockApi({
      "POST /api/upload/init": [singleInit("upl_1", 5), singleInit("upl_2", 5)],
      "PUT /api/upload/upl_1": fail(502, "Bad gateway"),
      "GET /api/upload/upl_1/status": [singleStatus("upl_1", "uploading"), singleStatus("upl_1", "failed")],
      "PUT /api/upload/upl_2": ok({ file: fileRow() }, 201),
    });
    const result = await new UploadResource(api.http({ retry: RETRY })).file({ workspaceId: "ws_1", fileName: "a.txt", body: bytes(5) });
    expect(result.sessionId).toBe("upl_2");
    expect(api.calls.filter((c) => c.path.endsWith("/status"))).toHaveLength(2);
  });

  it("does not re-send while the server keeps processing the first attempt", async () => {
    const api = mockApi({
      "POST /api/upload/init": singleInit("upl_1", 5),
      "PUT /api/upload/upl_1": fail(504, "Gateway timeout"),
      "GET /api/upload/upl_1/status": singleStatus("upl_1", "uploading"),
    });
    const err = await new UploadResource(api.http({ retry: RETRY }))
      .file({ workspaceId: "ws_1", fileName: "a.txt", body: bytes(5) })
      .catch((e) => e);
    expect(err).toBeInstanceOf(DosyaUploadError);
    expect(err.message).toMatch(/still processing/);
    expect(api.calls.filter((c) => c.path === "/api/upload/init")).toHaveLength(1);
  });

  it("reuses a session that never saw the failed PUT", async () => {
    let put = 0;
    const api = mockApi({
      "POST /api/upload/init": singleInit("upl_1", 5),
      "PUT /api/upload/upl_1": () => {
        if (put++ === 0) throw new TypeError("fetch failed");
        return ok({ file: fileRow() }, 201);
      },
      "GET /api/upload/upl_1/status": singleStatus("upl_1", "pending"),
    });
    const result = await new UploadResource(api.http({ retry: RETRY })).file({ workspaceId: "ws_1", fileName: "a.txt", body: bytes(5) });
    expect(result.sessionId).toBe("upl_1");
    expect(api.calls.filter((c) => c.path === "/api/upload/init")).toHaveLength(1);
    expect(api.calls.filter((c) => c.method === "PUT")).toHaveLength(2);
  });

  it("does not re-send when the outcome cannot be read", async () => {
    const api = mockApi({
      "POST /api/upload/init": singleInit("upl_1", 5),
      "PUT /api/upload/upl_1": fail(500, "boom"),
      "GET /api/upload/upl_1/status": fail(500, "boom"),
    });
    const err = await new UploadResource(api.http({ retry: RETRY }))
      .file({ workspaceId: "ws_1", fileName: "a.txt", body: bytes(5) })
      .catch((e) => e);
    expect(err).toBeInstanceOf(DosyaUploadError);
    expect(api.calls.filter((c) => c.path === "/api/upload/init")).toHaveLength(1);
  });

  it("does not re-send after a lost response when the session is complete", async () => {
    const api = mockApi({
      "POST /api/upload/init": singleInit("upl_1", 5),
      "PUT /api/upload/upl_1": () => {
        throw new TypeError("fetch failed");
      },
      "GET /api/upload/upl_1/status": ok({
        session_id: "upl_1", status: "complete", size_bytes: 5, part_size: null, total_parts: null,
        bytes_uploaded: 5, uploaded_parts: [], has_multipart: false,
      }),
    });
    const err = await new UploadResource(api.http({ retry: RETRY }))
      .file({ workspaceId: "ws_1", fileName: "a.txt", body: bytes(5) })
      .catch((e) => e);
    expect(err).toBeInstanceOf(DosyaUploadError);
    expect(err.sessionId).toBe("upl_1");
    expect(api.calls.filter((c) => c.path === "/api/upload/init")).toHaveLength(1);
  });

  it("never retries a 4xx and surfaces the machine code", async () => {
    const api = mockApi({
      "POST /api/upload/init": singleInit("upl_1", 5),
      "PUT /api/upload/upl_1": fail(400, "hash_mismatch", { expected: "a", received: "b" }),
    });
    const err = await new UploadResource(api.http({ retry: RETRY }))
      .file({ workspaceId: "ws_1", fileName: "a.txt", body: bytes(5) })
      .catch((e) => e);
    expect(err).toBeInstanceOf(DosyaApiError);
    expect(err.code).toBe("hash_mismatch");
    expect(api.calls).toHaveLength(2);
  });

  it("surfaces init refusals with their codes", async () => {
    const api = mockApi({
      "POST /api/upload/init": [
        fail(400, "You have 3 uploads in progress.", { error_code: "concurrent_upload_limit" }),
        fail(409, "version_conflict", { current_version: 7 }),
      ],
    });
    const upload = new UploadResource(api.http({ retry: RETRY }));
    const a = await upload.file({ workspaceId: "ws_1", fileName: "a.txt", body: bytes(1) }).catch((e) => e);
    expect(a.code).toBe("concurrent_upload_limit");
    const b = await upload.file({ workspaceId: "ws_1", fileName: "a.txt", body: bytes(1) }).catch((e) => e);
    expect(b.code).toBe("version_conflict");
    expect(b.details.current_version).toBe(7);
    expect(api.calls).toHaveLength(2);
  });
});

describe("upload.file() multipart", () => {
  it("uploads the first part alone before fanning out", async () => {
    const events: string[] = [];
    const api = mockApi({
      "POST /api/upload/init": multipartInit("upl_m", 10, 4),
      ...partRoutes("upl_m", 3, async (n) => {
        events.push(`start ${n}`);
        await new Promise((r) => setTimeout(r, n === 1 ? 20 : 5));
        events.push(`end ${n}`);
        return ok({ part_number: n, etag: `e${n}` }, 201);
      }),
      "POST /api/upload/upl_m/complete": ok({ file: fileRow({ size_bytes: 10 }) }, 201),
    });
    await new UploadResource(api.http()).file({
      workspaceId: "ws_1",
      fileName: "big.bin",
      body: bytes(10),
      concurrency: 3,
    });
    expect(events.indexOf("end 1")).toBeLessThan(events.indexOf("start 2"));
    expect(events.indexOf("end 1")).toBeLessThan(events.indexOf("start 3"));
    // After part 1, parts 2 and 3 run concurrently.
    expect(events.indexOf("start 3")).toBeLessThan(events.indexOf("end 2"));
  });

  it("slices a Blob per part instead of reading it whole", async () => {
    const blob = new Blob([bytes(10)]);
    const slice = vi.spyOn(blob, "slice");
    const arrayBuffer = vi.spyOn(blob, "arrayBuffer");
    const api = mockApi({
      "POST /api/upload/init": multipartInit("upl_m", 10, 4),
      ...partRoutes("upl_m", 3),
      "POST /api/upload/upl_m/complete": ok({ file: fileRow({ size_bytes: 10 }) }, 201),
    });
    await new UploadResource(api.http()).file({ workspaceId: "ws_1", fileName: "big.bin", body: blob });

    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(slice.mock.calls).toEqual(expect.arrayContaining([[0, 4], [4, 8], [8, 10]]));
    const partBodies = api.calls.filter((c) => c.path.includes("/part/")).map((c) => (c.rawBody as Blob).size);
    expect(partBodies.sort()).toEqual([2, 4, 4]);
  });

  it("reports exact bytes, including a short last part", async () => {
    const events: UploadProgress[] = [];
    const api = mockApi({
      "POST /api/upload/init": multipartInit("upl_m", 10, 4),
      ...partRoutes("upl_m", 3),
      "POST /api/upload/upl_m/complete": ok({ file: fileRow({ size_bytes: 10 }) }, 201),
    });
    await new UploadResource(api.http()).file({
      workspaceId: "ws_1",
      fileName: "big.bin",
      body: bytes(10),
      concurrency: 1,
      onProgress: (p) => events.push(p),
    });
    const uploading = events.filter((e) => e.status === "uploading").map((e) => e.bytesUploaded);
    expect(uploading).toEqual([0, 4, 8, 10]);
    expect(events.map((e) => e.status).slice(-2)).toEqual(["completing", "complete"]);
  });

  it("retries a part on 500 but not on 4xx", async () => {
    let part2 = 0;
    const api = mockApi({
      "POST /api/upload/init": multipartInit("upl_m", 10, 4),
      ...partRoutes("upl_m", 3, (n) => {
        if (n === 2 && part2++ === 0) return fail(500, "Failed to upload part to storage");
        if (n === 3) return fail(413, "Part exceeds the 10 MB part size");
        return ok({ part_number: n, etag: `e${n}` }, 201);
      }),
    });
    const err = await new UploadResource(api.http({ retry: RETRY }))
      .file({ workspaceId: "ws_1", fileName: "big.bin", body: bytes(10), concurrency: 1 })
      .catch((e) => e);

    const parts = api.calls.filter((c) => c.path.includes("/part/")).map((c) => c.path.split("/").pop());
    expect(parts).toEqual(["1", "2", "2", "3"]);
    expect(err).toBeInstanceOf(DosyaUploadError);
    expect(err.partNumber).toBe(3);
    expect(err.sessionId).toBe("upl_m");
    expect((err.cause as DosyaApiError).status).toBe(413);
  });

  it("sends source times on complete and explains a 409 after a retried complete", async () => {
    const api = mockApi({
      "POST /api/upload/init": multipartInit("upl_m", 8, 4),
      ...partRoutes("upl_m", 2),
      "POST /api/upload/upl_m/complete": [
        fail(502, "Bad gateway"),
        fail(409, "Upload session is already complete"),
      ],
      // The first complete ended without finishing, so a second one is safe.
      "GET /api/upload/upl_m/status": ok({
        session_id: "upl_m", status: "failed", size_bytes: 8, part_size: 4, total_parts: 2,
        bytes_uploaded: 8, uploaded_parts: [1, 2], has_multipart: true,
      }),
    });
    const err = await new UploadResource(api.http({ retry: RETRY }))
      .file({ workspaceId: "ws_1", fileName: "big.bin", body: bytes(8), sourceModifiedAt: 1_700_000_000 })
      .catch((e) => e);
    const completes = api.calls.filter((c) => c.path.endsWith("/complete"));
    expect(completes).toHaveLength(2);
    expect(completes[0].headers["x-dosya-source-mtime"]).toBe("1700000000");
    expect(err).toBeInstanceOf(DosyaUploadError);
    expect(err.message).toMatch(/id is unknown/);
  });

  it("reports a lost complete response instead of completing twice", async () => {
    const api = mockApi({
      "POST /api/upload/init": multipartInit("upl_m", 8, 4),
      ...partRoutes("upl_m", 2),
      "POST /api/upload/upl_m/complete": () => {
        throw new TypeError("fetch failed");
      },
      "GET /api/upload/upl_m/status": ok({
        session_id: "upl_m", status: "complete", size_bytes: 8, part_size: 4, total_parts: 2,
        bytes_uploaded: 8, uploaded_parts: [1, 2], has_multipart: true,
      }),
    });
    const err = await new UploadResource(api.http({ retry: RETRY }))
      .file({ workspaceId: "ws_1", fileName: "big.bin", body: bytes(8) })
      .catch((e) => e);
    expect(err).toBeInstanceOf(DosyaUploadError);
    expect(err.message).toMatch(/id is unknown/);
    expect(api.calls.filter((c) => c.path.endsWith("/complete"))).toHaveLength(1);
  });

  const mpStatus = (status: string, parts: number[], hasMultipart: boolean) =>
    ok({
      session_id: "upl_m", status, size_bytes: 8, part_size: 4, total_parts: 2,
      bytes_uploaded: parts.length * 4, uploaded_parts: parts, has_multipart: hasMultipart,
    });

  it("retries complete when the session still reads uploading after polling", async () => {
    const api = mockApi({
      "POST /api/upload/init": multipartInit("upl_m", 8, 4),
      ...partRoutes("upl_m", 2),
      "POST /api/upload/upl_m/complete": [fail(502, "Bad gateway"), ok({ file: fileRow() }, 201)],
      "GET /api/upload/upl_m/status": mpStatus("uploading", [1, 2], true),
    });
    const result = await new UploadResource(api.http({ retry: RETRY })).file({ workspaceId: "ws_1", fileName: "big.bin", body: bytes(8) });
    expect(result.file.id).toBe("file_1");
    expect(api.calls.filter((c) => c.path.endsWith("/complete"))).toHaveLength(2);
    expect(api.calls.filter((c) => c.path.endsWith("/status"))).toHaveLength(7);
  });

  it("does not resend a first part whose lost response was stored", async () => {
    let first = 0;
    const api = mockApi({
      "POST /api/upload/init": multipartInit("upl_m", 8, 4),
      ...partRoutes("upl_m", 2, (n) => {
        if (n === 1 && first++ === 0) throw new TypeError("fetch failed");
        return ok({ part_number: n, etag: `e${n}` }, 201);
      }),
      "GET /api/upload/upl_m/status": mpStatus("uploading", [1], true),
      "POST /api/upload/upl_m/complete": ok({ file: fileRow() }, 201),
    });
    await new UploadResource(api.http({ retry: RETRY })).file({ workspaceId: "ws_1", fileName: "big.bin", body: bytes(8) });
    expect(api.calls.filter((c) => c.path.endsWith("/part/1"))).toHaveLength(1);
    expect(api.calls.filter((c) => c.path.endsWith("/part/2"))).toHaveLength(1);
  });

  it("retries the first part once the multipart upload is recorded", async () => {
    let first = 0;
    const api = mockApi({
      "POST /api/upload/init": multipartInit("upl_m", 8, 4),
      ...partRoutes("upl_m", 2, (n) =>
        n === 1 && first++ === 0 ? fail(502, "Bad gateway") : ok({ part_number: n, etag: `e${n}` }, 201),
      ),
      "GET /api/upload/upl_m/status": mpStatus("uploading", [], true),
      "POST /api/upload/upl_m/complete": ok({ file: fileRow() }, 201),
    });
    await new UploadResource(api.http({ retry: RETRY })).file({ workspaceId: "ws_1", fileName: "big.bin", body: bytes(8) });
    expect(api.calls.filter((c) => c.path.endsWith("/part/1"))).toHaveLength(2);
    expect(api.calls.filter((c) => c.path.endsWith("/status"))).toHaveLength(1);
  });

  it("reads a stream part by part", async () => {
    const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6, 7, 8, 9, 10])];
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        const next = chunks.shift();
        if (next) c.enqueue(next);
        else c.close();
      },
    });
    const api = mockApi({
      "POST /api/upload/init": multipartInit("upl_m", 10, 4),
      ...partRoutes("upl_m", 3),
      "POST /api/upload/upl_m/complete": ok({ file: fileRow({ size_bytes: 10 }) }, 201),
    });
    await new UploadResource(api.http()).file({ workspaceId: "ws_1", fileName: "big.bin", fileSize: 10, body: stream });
    const parts = api.calls.filter((c) => c.path.includes("/part/")).map((c) => Array.from(c.rawBody as Uint8Array));
    expect(parts).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10]]);
  });
});

describe("upload.resume()", () => {
  const status = (overrides: Record<string, unknown>) =>
    ok({
      session_id: "upl_m", status: "failed", size_bytes: 10, part_size: 4, total_parts: 3,
      bytes_uploaded: 0, uploaded_parts: [], has_multipart: false, ...overrides,
    });

  it("resumes a multipart session with no parts yet (hasMultipart false), first part alone", async () => {
    const events: string[] = [];
    const api = mockApi({
      "GET /api/upload/upl_m/status": status({}),
      ...partRoutes("upl_m", 3, async (n) => {
        events.push(`start ${n}`);
        await new Promise((r) => setTimeout(r, n === 1 ? 15 : 1));
        events.push(`end ${n}`);
        return ok({ part_number: n, etag: `e${n}` }, 201);
      }),
      "POST /api/upload/upl_m/complete": ok({ file: fileRow({ size_bytes: 10 }) }, 201),
    });
    const result = await new UploadResource(api.http()).resume("upl_m", bytes(10));
    expect(result.file.sizeBytes).toBe(10);
    expect(events.indexOf("end 1")).toBeLessThan(events.indexOf("start 2"));
  });

  it("skips stored parts and seeds progress from them", async () => {
    const events: UploadProgress[] = [];
    const api = mockApi({
      "GET /api/upload/upl_m/status": status({ uploaded_parts: [1, 3], has_multipart: true, bytes_uploaded: 6 }),
      ...partRoutes("upl_m", 3),
      "POST /api/upload/upl_m/complete": ok({ file: fileRow({ size_bytes: 10 }) }, 201),
    });
    await new UploadResource(api.http()).resume("upl_m", new Blob([bytes(10)]), { onProgress: (p) => events.push(p) });
    expect(api.calls.filter((c) => c.path.includes("/part/")).map((c) => c.path)).toEqual(["/api/upload/upl_m/part/2"]);
    expect(events[0]).toMatchObject({ bytesUploaded: 6, partsCompleted: 2, totalParts: 3 });
  });

  it("refuses a body of the wrong size and single-request sessions", async () => {
    const api = mockApi({
      "GET /api/upload/upl_m/status": [status({}), status({ part_size: null, total_parts: null })],
    });
    const upload = new UploadResource(api.http());
    await expect(upload.resume("upl_m", bytes(9))).rejects.toThrow(/expects 10/);
    await expect(upload.resume("upl_m", bytes(10))).rejects.toThrow(DosyaUploadError);
    expect(api.calls.every((c) => c.method === "GET")).toBe(true);
  });
});

describe("upload low-level methods", () => {
  it("encodes session ids and validates part numbers", async () => {
    const api = mockApi({
      "GET /api/upload/a%2Fb/status": ok({ session_id: "a/b", status: "pending", uploaded_parts: [] }),
      "PUT /api/upload/a%2Fb/part/2": ok({ part_number: 2, etag: "x", already_uploaded: true }),
      "POST /api/upload/a%2Fb/complete": ok({ file: fileRow() }, 201),
    });
    const upload = new UploadResource(api.http({ retry: RETRY }));
    expect((await upload.status("a/b")).status).toBe("pending");
    expect(await upload.uploadPart("a/b", 2, bytes(3))).toEqual({ partNumber: 2, etag: "x", alreadyUploaded: true });
    const done = await upload.complete("a/b", { sourceCreatedAt: 1_650_000_000 });
    expect(done.file.id).toBe("file_1");
    expect(api.calls[2].headers["x-dosya-source-ctime"]).toBe("1650000000");
    await expect(upload.uploadPart("a/b", 0, bytes(1))).rejects.toThrow(TypeError);
    await expect(upload.status("..")).rejects.toThrow(TypeError);
  });
});

describe("upload.batch()", () => {
  it("builds a snake_case manifest and maps results back to input order", async () => {
    const api = mockApi({
      "POST /api/upload/batch": ok({
        results: [
          { field: "f2", ok: true, fileId: "file_c", name: "c.txt", version: 2 },
          { field: "f0", ok: false, error: "version_conflict", current_version: 4 },
        ],
      }),
    });
    const res = await new UploadResource(api.http()).batch({
      workspaceId: "ws_1",
      files: [
        { name: "a.txt", body: new Blob(["aa"]), folderId: "fld_1", expectedVersion: 3, sourceModifiedAt: 1_700_000_000 },
        { name: "b.txt", body: new Uint8Array([1]), sha256: "0".repeat(64) },
        { name: "c.txt", body: new ArrayBuffer(3), fileId: "file_c", sourceCreatedAt: new Date(1_600_000_000_000) },
      ],
    });

    const form = api.calls[0].rawBody as FormData;
    expect(JSON.parse(form.get("manifest") as string)).toEqual({
      workspace_id: "ws_1",
      files: [
        { name: "a.txt", folder_id: "fld_1", file_id: null, field: "f0", expected_version: 3, source_modified_at: 1_700_000_000 },
        { name: "b.txt", folder_id: null, file_id: null, field: "f1", sha256: "0".repeat(64) },
        { name: "c.txt", folder_id: null, file_id: "file_c", field: "f2", source_created_at: 1_600_000_000 },
      ],
    });
    expect((form.get("f0") as Blob).size).toBe(2);
    expect((form.get("f2") as File).name).toBe("f2");

    expect(res.results).toEqual([
      { ok: false, error: "version_conflict", currentVersion: 4 },
      { ok: false, error: "The server did not report a result for this file" },
      { ok: true, fileId: "file_c", name: "c.txt", version: 2 },
    ]);
  });

  it("validates limits before sending and never retries", async () => {
    const api = mockApi({ "POST /api/upload/batch": fail(503, "Service unavailable") });
    const upload = new UploadResource(api.http({ retry: RETRY }));
    const one = { name: "x", body: new Uint8Array(1) };

    await expect(upload.batch({ workspaceId: "ws_1", files: Array(201).fill(one) })).rejects.toThrow(RangeError);
    await expect(
      upload.batch({ workspaceId: "ws_1", files: [{ name: "x", body: new Uint8Array(5 * 1024 * 1024 + 1) }] }),
    ).rejects.toThrow(/5 MiB/);
    const big = { name: "x", body: new Blob([new Uint8Array(5 * 1024 * 1024)]) };
    await expect(upload.batch({ workspaceId: "ws_1", files: Array(21).fill(big) })).rejects.toThrow(/100 MiB/);
    await expect(upload.batch({ workspaceId: "ws_1", files: [] })).rejects.toThrow(TypeError);
    expect(api.calls).toHaveLength(0);

    await expect(upload.batch({ workspaceId: "ws_1", files: [one] })).rejects.toBeInstanceOf(DosyaApiError);
    expect(api.calls).toHaveLength(1);
  });
});

describe("upload.many()", () => {
  it("routes small files to batch and large files or streams to upload.file, in input order", async () => {
    const large = new Uint8Array(5 * 1024 * 1024 + 1);
    const api = mockApi({
      "POST /api/upload/batch": (call) => {
        const manifest = JSON.parse((call.rawBody as FormData).get("manifest") as string);
        return ok({
          results: manifest.files.map((f: { field: string; name: string }) =>
            f.name === "bad.txt"
              ? { field: f.field, ok: false, error: "folder_locked" }
              : { field: f.field, ok: true, fileId: `id_${f.name}`, name: f.name, version: 1 },
          ),
        });
      },
      "POST /api/upload/init": [singleInit("upl_1", large.byteLength), singleInit("upl_2", 2)],
      "PUT /api/upload/upl_1": ok({ file: fileRow({ id: "file_big", name: "big.bin", size_bytes: large.byteLength }) }, 201),
      "PUT /api/upload/upl_2": ok({ file: fileRow({ id: "file_s", name: "s.txt", size_bytes: 2 }) }, 201),
    });
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1, 2]));
        c.close();
      },
    });

    const results = await new UploadResource(api.http()).many({
      workspaceId: "ws_1",
      concurrency: 1,
      files: [
        { name: "a.txt", body: new Uint8Array([1]) },
        { name: "big.bin", body: large },
        { name: "bad.txt", body: new Blob(["x"]) },
        { name: "s.txt", body: stream, fileSize: 2 },
      ],
    });

    const batchCalls = api.calls.filter((c) => c.path === "/api/upload/batch");
    expect(batchCalls).toHaveLength(1);
    const manifest = JSON.parse((batchCalls[0].rawBody as FormData).get("manifest") as string);
    expect(manifest.files.map((f: { name: string }) => f.name)).toEqual(["a.txt", "bad.txt"]);
    expect(api.calls.filter((c) => c.path === "/api/upload/init")).toHaveLength(2);

    expect(results.map((r) => r.ok)).toEqual([true, true, false, true]);
    expect(results[0]).toEqual({ ok: true, name: "a.txt", fileId: "id_a.txt", version: 1 });
    expect(results[1]).toMatchObject({ ok: true, fileId: "file_big" });
    expect(results[2]).toEqual({ ok: false, name: "bad.txt", error: "folder_locked", code: "folder_locked" });
  });

  it("fails every file of a refused batch without throwing", async () => {
    const api = mockApi({ "POST /api/upload/batch": fail(403, "No upload permission") });
    const results = await new UploadResource(api.http()).many({
      workspaceId: "ws_1",
      files: [
        { name: "a", body: new Uint8Array(1) },
        { name: "b", body: new Uint8Array(1) },
      ],
    });
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBe("No upload permission");
        expect(r.cause).toBeInstanceOf(DosyaApiError);
      }
    }
  });

  it("splits batches at 200 files", async () => {
    const api = mockApi({
      "POST /api/upload/batch": (call) => {
        const manifest = JSON.parse((call.rawBody as FormData).get("manifest") as string);
        return ok({
          results: manifest.files.map((f: { field: string; name: string }) => ({
            field: f.field, ok: true, fileId: f.name, name: f.name, version: 1,
          })),
        });
      },
    });
    const files = Array.from({ length: 450 }, (_, i) => ({ name: `f${i}`, body: new Uint8Array(1) }));
    const results = await new UploadResource(api.http()).many({ workspaceId: "ws_1", files });
    expect(api.calls).toHaveLength(3);
    expect(results.map((r) => (r.ok ? r.fileId : null))).toEqual(files.map((f) => f.name));
  });
});
