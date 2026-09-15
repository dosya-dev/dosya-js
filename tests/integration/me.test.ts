import { describe, it, expect, beforeAll } from "vitest";
import { getClient, getWorkspaceId } from "../helpers.js";
import type { DosyaClient } from "../../src/index.js";

describe("Me Resource", () => {
  let client: DosyaClient;

  beforeAll(() => {
    client = getClient();
  });

  describe("profile()", () => {
    it("should return user profile with all expected fields", async () => {
      const { user } = await client.me.profile();

      expect(user).toBeDefined();
      expect(user.id).toBeTruthy();
      expect(user.email).toBeTruthy();
      expect(user.name).toBeTruthy();
      expect(user.initials).toBeTruthy();
      expect(typeof user.createdAt).toBe("number");
      expect(typeof user.workspaceCount).toBe("number");
      expect(typeof user.hasPassword).toBe("boolean");
      expect(typeof user.tourCompleted).toBe("boolean");
      expect(user.deletionScheduledFor === null || typeof user.deletionScheduledFor === "number").toBe(true);
    });

    it("should return a valid email address", async () => {
      const { user } = await client.me.profile();
      expect(user.email).toMatch(/.+@.+\..+/);
    });
  });

  describe("permissions()", () => {
    it("should return the caller's role and a snake_case permission map", async () => {
      const workspaceId = await getWorkspaceId(client);
      const { user } = await client.me.profile();
      const perms = await client.me.permissions(workspaceId);

      expect(perms.userId).toBe(user.id);
      expect(perms.roleId).toBeTruthy();
      expect(typeof perms.isBuiltin).toBe("boolean");
      expect(typeof perms.permissions).toBe("object");
      expect(typeof perms.permissions.upload_files).toBe("boolean");
    });
  });

  describe("updateName()", () => {
    it("should change the display name and restore it", async () => {
      const { user } = await client.me.profile();
      const temp = `SDK test ${Date.now()}`;
      try {
        const res = await client.me.updateName(temp);
        expect(res.name).toBe(temp);
        const { user: after } = await client.me.profile();
        expect(after.name).toBe(temp);
      } finally {
        await client.me.updateName(user.name);
      }
    });
  });

  // revokeCurrentKey() is not exercised here: it would destroy the test key.
});
