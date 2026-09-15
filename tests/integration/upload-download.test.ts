import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getClient, getWorkspaceId, uploadTestFile } from "../helpers.js";
import type { DosyaClient } from "../../src/index.js";
import type { UploadProgress } from "../../src/types/upload.js";
import { DosyaApiError } from "../../src/errors.js";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("Upload & Download Resources", () => {
  let client: DosyaClient;
  let workspaceId: string;
  let uploadedFileId: string;
  const uploadedText = "Hello from dosya-js SDK test!";
  const filesToCleanup: string[] = [];

  beforeAll(async () => {
    client = getClient();
    workspaceId = await getWorkspaceId(client);
  });

  afterAll(async () => {
    for (const id of filesToCleanup) {
      try {
        await client.files.delete(id);
      } catch {
        /* already cleaned up */
      }
    }
  });

  // ─── Upload ───────────────────────────────────────────

  describe("upload.file()", () => {
    it("uploads a small file with progress, sha256 and a source date", async () => {
      const progressUpdates: UploadProgress[] = [];
      const content = new TextEncoder().encode(uploadedText);
      const sha256 = await sha256Hex(content);

      const result = await client.upload.file({
        workspaceId,
        fileName: `test-upload-${Date.now()}.txt`,
        body: content,
        sha256,
        sourceModifiedAt: new Date("2024-01-02T03:04:05Z"),
        onProgress: (p) => progressUpdates.push(p),
      });

      uploadedFileId = result.file.id;
      filesToCleanup.push(uploadedFileId);

      expect(result.file.id).toBeTruthy();
      expect(result.file.name).toContain("test-upload");
      expect(result.file.sizeBytes).toBe(content.byteLength);
      expect(result.file.mimeType).toBe("text/plain");
      expect(result.file.contentHash).toBe(sha256);
      expect(result.file.hashVerified).toBe(true);
      expect(result.sessionId).toBeTruthy();
      expect(typeof result.file.version).toBe("number");
      expect(typeof result.file.createdAt).toBe("number");

      expect(progressUpdates[0].status).toBe("initializing");
      const last = progressUpdates[progressUpdates.length - 1];
      expect(last.status).toBe("complete");
      expect(last.percent).toBe(100);
    });

    it("refuses a wrong sha256 with hash_mismatch", async () => {
      const content = new TextEncoder().encode("hash me");
      const err = await client.upload
        .file({ workspaceId, fileName: `bad-hash-${Date.now()}.txt`, body: content, sha256: "0".repeat(64) })
        .catch((e) => e);
      expect(err).toBeInstanceOf(DosyaApiError);
      expect((err as DosyaApiError).code).toBe("hash_mismatch");
    });

    it("uploads a file to a specific folder", async () => {
      const { folder } = await client.folders.create({
        workspaceId,
        name: `upload-folder-${Date.now()}`,
      });

      try {
        const { result } = await uploadTestFile(client, workspaceId, {
          folderId: folder.id,
        });
        filesToCleanup.push(result.file.id);

        const { file } = await client.files.get(result.file.id);
        expect(file.folderId).toBe(folder.id);
      } finally {
        await client.folders.delete(folder.id);
      }
    });

    it("uploads ArrayBuffer and Blob sources", async () => {
      const buffer = new TextEncoder().encode("ArrayBuffer upload test").buffer;
      const a = await client.upload.file({ workspaceId, fileName: `arraybuffer-${Date.now()}.txt`, body: buffer });
      filesToCleanup.push(a.file.id);
      expect(a.file.sizeBytes).toBe(buffer.byteLength);

      const blob = new Blob(["Blob upload test"], { type: "text/plain" });
      const b = await client.upload.file({ workspaceId, fileName: `blob-${Date.now()}.txt`, body: blob });
      filesToCleanup.push(b.file.id);
      expect(b.file.sizeBytes).toBe(blob.size);
    });

    it("rejects a stale expectedVersion with version_conflict", async () => {
      const { result } = await uploadTestFile(client, workspaceId);
      filesToCleanup.push(result.file.id);
      const err = await client.upload
        .file({
          workspaceId,
          fileName: result.file.name,
          fileId: result.file.id,
          expectedVersion: 99,
          body: new TextEncoder().encode("v2"),
        })
        .catch((e) => e);
      expect(err).toBeInstanceOf(DosyaApiError);
      expect((err as DosyaApiError).code).toBe("version_conflict");
      expect((err as DosyaApiError).details.current_version).toBe(result.file.version);
    });
  });

  // ─── Upload init & status ─────────────────────────────

  describe("upload.init() and upload.status()", () => {
    it("initializes a session and reports its status", async () => {
      const session = await client.upload.init({
        workspaceId,
        fileName: `init-test-${Date.now()}.txt`,
        fileSize: 100,
        mimeType: "text/plain",
      });

      expect(session.sessionId).toBeTruthy();
      expect(session.uploadUrl).toBeTruthy();
      expect(session.fileName).toContain("init-test");
      expect(session.fileSize).toBe(100);
      expect(session.workspaceId).toBe(workspaceId);
      expect(session.resumable).toBeNull();

      const status = await client.upload.status(session.sessionId);
      expect(status.sessionId).toBe(session.sessionId);
      expect(status.status).toBe("pending");
      expect(typeof status.bytesUploaded).toBe("number");
      expect(status.hasMultipart).toBe(false);
    });
  });

  // ─── Batch / many ─────────────────────────────────────

  describe("upload.batch() and upload.many()", () => {
    it("uploads several small files in one request", async () => {
      const stamp = Date.now();
      const { results } = await client.upload.batch({
        workspaceId,
        files: [
          { name: `batch-a-${stamp}.txt`, body: new TextEncoder().encode("a") },
          { name: `batch-b-${stamp}.txt`, body: new Blob(["bb"]) },
        ],
      });
      expect(results).toHaveLength(2);
      for (const r of results) {
        expect(r.ok).toBe(true);
        if (r.ok) filesToCleanup.push(r.fileId);
      }
    });

    it("returns per-file results in input order", async () => {
      const stamp = Date.now();
      const results = await client.upload.many({
        workspaceId,
        files: [
          { name: `many-a-${stamp}.txt`, body: new TextEncoder().encode("a") },
          { name: `many-b-${stamp}.txt`, body: new TextEncoder().encode("b") },
        ],
      });
      expect(results.map((r) => r.name)).toEqual([`many-a-${stamp}.txt`, `many-b-${stamp}.txt`]);
      for (const r of results) {
        expect(r.ok).toBe(true);
        if (r.ok) filesToCleanup.push(r.fileId);
      }
    });
  });

  // ─── Download ─────────────────────────────────────────

  describe("download.getUrl()", () => {
    it("returns a presigned link with metadata", async () => {
      const link = await client.download.getUrl(uploadedFileId, { ttl: 120 });

      expect(link.url.startsWith("https://")).toBe(true);
      expect(link.size).toBe(uploadedText.length);
      expect(link.name).toContain("test-upload");
      expect(link.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe("download.arrayBuffer() / blob() / stream()", () => {
    it("downloads the uploaded content", async () => {
      const buffer = await client.download.arrayBuffer(uploadedFileId);
      expect(new TextDecoder().decode(buffer)).toBe(uploadedText);

      const blob = await client.download.blob(uploadedFileId);
      expect(blob.size).toBe(uploadedText.length);

      const stream = await client.download.stream(uploadedFileId, { range: { start: 0, end: 4 } });
      const text = await new Response(stream).text();
      expect(text).toBe(uploadedText.slice(0, 5));
    });
  });

  describe("download.raw()", () => {
    it("returns the inline bytes, honouring Range", async () => {
      const res = await client.download.raw(uploadedFileId, { range: { start: 0, end: 4 } });
      expect(res.status).toBe(206);
      expect(await res.text()).toBe(uploadedText.slice(0, 5));
    });
  });

  describe("download.archive()", () => {
    it("streams a zip of the selected files", async () => {
      const res = await client.download.archive({ fileIds: [uploadedFileId] });
      expect(res.headers.get("content-type")).toContain("zip");
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(bytes[0]).toBe(0x50);
      expect(bytes[1]).toBe(0x4b);
    });
  });
});
