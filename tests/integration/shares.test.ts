import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getClient, getWorkspaceId, uploadTestFile } from "../helpers.js";
import type { DosyaClient } from "../../src/index.js";

describe("Shares Resource", () => {
  let client: DosyaClient;
  let workspaceId: string;
  let fileId: string;
  let shareLinkId: string;

  beforeAll(async () => {
    client = getClient();
    workspaceId = await getWorkspaceId(client);

    const { result } = await uploadTestFile(client, workspaceId);
    fileId = result.file.id;

    // Create a share link to test with
    const { link } = await client.files.createShareLink(fileId, {
      expiresInDays: 1,
    });
    shareLinkId = link.id;
  });

  afterAll(async () => {
    if (fileId) {
      try {
        await client.files.delete(fileId);
      } catch {
        /* already cleaned up */
      }
    }
  });

  describe("list()", () => {
    it("should list all share links for a workspace", async () => {
      const result = await client.shares.list(workspaceId);

      expect(Array.isArray(result.links)).toBe(true);
      expect(result.links.length).toBeGreaterThanOrEqual(1);
    });

    it("should include share stats", async () => {
      const result = await client.shares.list(workspaceId);

      expect(result.stats).toBeDefined();
      expect(typeof result.stats.total).toBe("number");
      expect(typeof result.stats.active).toBe("number");
      expect(typeof result.stats.expiring).toBe("number");
      expect(typeof result.stats.totalViews).toBe("number");
    });

    it("should return share links with expected fields", async () => {
      const result = await client.shares.list(workspaceId);
      const link = result.links.find((l) => l.linkId === shareLinkId);

      expect(link).toBeDefined();
      expect(link!.fileId).toBe(fileId);
      expect(link!.token).toBeTruthy();
      expect(link!.url).toBeTruthy();
      expect(link!.status).toBeTruthy();
      expect(typeof link!.downloadCount).toBe("number");
      expect(typeof link!.sharedAt).toBe("number");
    });
  });

  describe("update()", () => {
    it("should change the download cap in place", async () => {
      const { link } = await client.shares.update(shareLinkId, { maxDownloads: 5 });

      expect(link.linkId).toBe(shareLinkId);
      expect(link.maxDownloads).toBe(5);
    });
  });

  describe("analytics()", () => {
    it("should return the analytics report", async () => {
      const report = await client.shares.analytics(shareLinkId, { range: 7 });

      expect(report.link.linkId).toBe(shareLinkId);
      expect(report.range).toBe(7);
      expect(Array.isArray(report.timeline)).toBe(true);
    });
  });

  describe("revoke()", () => {
    it("should revoke an active share link", async () => {
      // Create a fresh link to revoke
      const { link } = await client.files.createShareLink(fileId, {
        expiresInDays: 1,
      });

      await expect(client.shares.revoke(link.id)).resolves.toBeUndefined();
    });

    it("should revoke the test share link", async () => {
      await expect(
        client.shares.revoke(shareLinkId),
      ).resolves.toBeUndefined();
    });
  });
});
