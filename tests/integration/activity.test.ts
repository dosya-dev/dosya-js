import { describe, it, expect, beforeAll } from "vitest";
import { getClient, getWorkspaceId } from "../helpers.js";
import type { DosyaClient } from "../../src/index.js";

describe("Activity Resource", () => {
  let client: DosyaClient;
  let workspaceId: string;

  beforeAll(async () => {
    client = getClient();
    workspaceId = await getWorkspaceId(client);
  });

  describe("list()", () => {
    it("should return activity list with members", async () => {
      const result = await client.activity.list({ workspaceId });

      expect(Array.isArray(result.activities)).toBe(true);
      expect(Array.isArray(result.members)).toBe(true);
      expect(result.pagination).toBeDefined();
    });

    it("should include pagination metadata", async () => {
      const result = await client.activity.list({ workspaceId });

      expect(typeof result.pagination.page).toBe("number");
      expect(typeof result.pagination.perPage).toBe("number");
      expect(typeof result.pagination.total).toBe("number");
      expect(typeof result.pagination.totalPages).toBe("number");
    });

    it("should support custom pagination", async () => {
      const result = await client.activity.list({
        workspaceId,
        page: 1,
        perPage: 10,
      });

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.perPage).toBe(10);
    });

    it("should raise perPage below 10 to 10", async () => {
      const result = await client.activity.list({ workspaceId, perPage: 5 });
      expect(result.pagination.perPage).toBe(10);
    });

    it("should filter by several categories", async () => {
      const result = await client.activity.list({ workspaceId, category: ["files", "folders"] });
      for (const a of result.activities) expect(a.action).toMatch(/^(file|folder)_/);
    });

    it("should filter by action type", async () => {
      const result = await client.activity.list({
        workspaceId,
        action: "file_uploaded",
      });

      expect(Array.isArray(result.activities)).toBe(true);

      // All returned activities should match the filter
      for (const activity of result.activities) {
        expect(activity.action).toBe("file_uploaded");
      }
    });

    it("should return activity entries with expected fields", async () => {
      const result = await client.activity.list({
        workspaceId,
        perPage: 10,
      });

      if (result.activities.length > 0) {
        const activity = result.activities[0];
        expect(activity.id).toBeTruthy();
        expect(activity.action).toBeTruthy();
        expect(activity.entityType).toBeTruthy();
        expect(activity.outcome).toBeTruthy();
        expect(typeof activity.createdAt).toBe("number");
      }
    });

    it("should return members with expected fields", async () => {
      const result = await client.activity.list({ workspaceId });

      if (result.members.length > 0) {
        const member = result.members[0];
        expect(member.id).toBeTruthy();
        expect(member.name).toBeTruthy();
        expect(member.email).toBeTruthy();
      }
    });
  });
});
