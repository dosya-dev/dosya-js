import { describe, it, expect, beforeAll } from "vitest";
import { getClient, getWorkspaceId } from "../helpers.js";
import type { DosyaClient } from "../../src/index.js";

describe("Search Resource", () => {
  let client: DosyaClient;
  let workspaceId: string;

  beforeAll(async () => {
    client = getClient();
    workspaceId = await getWorkspaceId(client);
  });

  describe("query()", () => {
    it("should return structured search results", async () => {
      const result = await client.search.query({
        workspaceId,
        q: "test",
      });

      expect(result.query).toBe("test");
      expect(Array.isArray(result.files)).toBe(true);
      expect(Array.isArray(result.folders)).toBe(true);
      expect(Array.isArray(result.shared)).toBe(true);
      expect(Array.isArray(result.fileRequests)).toBe(true);
      expect(result.pagination).toBeDefined();
    });

    it("should return empty results for nonsense query", async () => {
      const result = await client.search.query({
        workspaceId,
        q: "zzz_nonexistent_query_xyz_999",
      });

      expect(result.files.length).toBe(0);
      expect(result.folders.length).toBe(0);
      expect(result.shared.length).toBe(0);
      expect(result.fileRequests.length).toBe(0);
    });

    it("should support pagination params", async () => {
      const result = await client.search.query({
        workspaceId,
        q: "test",
        page: 1,
        perPage: 5,
      });

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.perPage).toBe(5);
      expect(typeof result.pagination.totalFiles).toBe("number");
      expect(typeof result.pagination.totalFolders).toBe("number");
      expect(typeof result.pagination.hasMore).toBe("boolean");
    });

    it("should parse an ext: token", async () => {
      const result = await client.search.query({ workspaceId, q: "ext:pdf" });
      expect(result.ext).toBe("pdf");
      expect(result.folders.length).toBe(0);
      expect(result.fileRequests.length).toBe(0);
      for (const file of result.files) expect(file.extension).toBe("pdf");
    });

    it("should never expose file request tokens", async () => {
      const result = await client.search.query({ workspaceId, q: "test" });
      for (const r of result.fileRequests) expect(r).not.toHaveProperty("token");
    });

    it("should return file results with expected fields", async () => {
      const result = await client.search.query({
        workspaceId,
        q: "test",
      });

      if (result.files.length > 0) {
        const file = result.files[0];
        expect(file.id).toBeTruthy();
        expect(file.name).toBeTruthy();
        expect(typeof file.sizeBytes).toBe("number");
        expect(file.mimeType).toBeTruthy();
        expect(typeof file.createdAt).toBe("number");
      }
    });

    it("should return folder results with expected fields", async () => {
      const result = await client.search.query({
        workspaceId,
        q: "test",
      });

      if (result.folders.length > 0) {
        const folder = result.folders[0];
        expect(folder.id).toBeTruthy();
        expect(folder.name).toBeTruthy();
        expect(typeof folder.createdAt).toBe("number");
      }
    });
  });
});
