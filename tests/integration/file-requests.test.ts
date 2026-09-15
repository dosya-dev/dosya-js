import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getClient, getWorkspaceId } from "../helpers.js";
import type { DosyaClient } from "../../src/index.js";

describe("File Requests Resource", () => {
  let client: DosyaClient;
  let workspaceId: string;
  let requestId: string;

  beforeAll(async () => {
    client = getClient();
    workspaceId = await getWorkspaceId(client);
  });

  afterAll(async () => {
    if (requestId) {
      try {
        await client.fileRequests.delete(requestId);
      } catch {
        /* already cleaned up */
      }
    }
  });

  describe("create()", () => {
    it("should create a file request with basic options", async () => {
      const { request } = await client.fileRequests.create({
        workspaceId,
        title: `SDK Test Request ${Date.now()}`,
        message: "Please upload your files here",
        expiresInDays: 1,
      });

      requestId = request.id;

      expect(request.id).toBeTruthy();
      expect(request.token).toBeTruthy();
      expect(request.url).toBeTruthy();
      expect(request.title).toContain("SDK Test Request");
    });

    it("should create a file request with file constraints", async () => {
      const { request } = await client.fileRequests.create({
        workspaceId,
        title: "Constrained Request",
        maxFiles: 3,
        maxFileSizeMb: 10,
        allowedExtensions: ".pdf,.docx",
        expiresInDays: 1,
      });

      expect(request.id).toBeTruthy();
      await client.fileRequests.delete(request.id);
    });

    it("should create a password-protected file request", async () => {
      const { request } = await client.fileRequests.create({
        workspaceId,
        title: "Protected Request",
        password: "secret123",
        expiresInDays: 1,
      });

      expect(request.id).toBeTruthy();
      await client.fileRequests.delete(request.id);
    });

    it("should create a file request in a specific folder", async () => {
      const { folder } = await client.folders.create({
        workspaceId,
        name: `request-folder-${Date.now()}`,
      });

      try {
        const { request } = await client.fileRequests.create({
          workspaceId,
          folderId: folder.id,
          title: "Folder Request",
          expiresInDays: 1,
        });

        expect(request.id).toBeTruthy();
        await client.fileRequests.delete(request.id);
      } finally {
        await client.folders.delete(folder.id);
      }
    });
  });

  describe("list()", () => {
    it("should include the created request", async () => {
      const { requests } = await client.fileRequests.list(workspaceId);

      expect(requests.some((r) => r.id === requestId)).toBe(true);
    });
  });

  describe("get()", () => {
    it("should return file request details with uploads and recipients", async () => {
      const { request, uploads, recipients } = await client.fileRequests.get(requestId);

      expect(request.id).toBe(requestId);
      expect(request.workspaceId).toBe(workspaceId);
      expect(request.title).toBeTruthy();
      expect(request.token).toBeTruthy();
      expect(request.url).toBeTruthy();
      expect(typeof request.uploadCount).toBe("number");
      expect(typeof request.createdAt).toBe("number");
      expect(Array.isArray(uploads)).toBe(true);
      expect(Array.isArray(recipients)).toBe(true);
    });
  });

  describe("update()", () => {
    it("should update title and message", async () => {
      const newTitle = `Updated Request ${Date.now()}`;
      await expect(
        client.fileRequests.update(requestId, {
          title: newTitle,
          message: "Updated message",
        }),
      ).resolves.toBeUndefined();

      const { request } = await client.fileRequests.get(requestId);
      expect(request.title).toBe(newTitle);
      expect(request.message).toBe("Updated message");
    });

    it("should update limits and clear them again", async () => {
      await client.fileRequests.update(requestId, { maxFiles: 7, expiresInDays: 2 });
      let { request } = await client.fileRequests.get(requestId);
      expect(request.maxFiles).toBe(7);

      await client.fileRequests.update(requestId, { maxFiles: null });
      ({ request } = await client.fileRequests.get(requestId));
      expect(request.maxFiles).toBeNull();
    });
  });

  describe("listUploads()", () => {
    it("should return uploads array (may be empty)", async () => {
      const { uploads } = await client.fileRequests.listUploads(requestId);

      expect(Array.isArray(uploads)).toBe(true);
    });
  });

  describe("recipients", () => {
    it("should list, add, resend and remove a recipient", async () => {
      const email = `sdk-recipient-${Date.now()}@example.com`;
      const { id } = await client.fileRequests.addRecipient(requestId, email);
      expect(id).toBeTruthy();

      const { recipients } = await client.fileRequests.listRecipients(requestId);
      expect(recipients.some((r) => r.id === id && r.email === email)).toBe(true);

      try {
        await client.fileRequests.resend(requestId, id);
      } catch (err) {
        // 500 when the server has no email provider configured.
        expect((err as { status?: number }).status).toBe(500);
      }

      await client.fileRequests.removeRecipient(requestId, id);
      const after = await client.fileRequests.listRecipients(requestId);
      expect(after.recipients.some((r) => r.id === id)).toBe(false);
    });
  });

  describe("delete()", () => {
    it("should delete a file request", async () => {
      const { request } = await client.fileRequests.create({
        workspaceId,
        title: "Delete Test",
        expiresInDays: 1,
      });

      await expect(
        client.fileRequests.delete(request.id),
      ).resolves.toBeUndefined();
    });
  });
});
