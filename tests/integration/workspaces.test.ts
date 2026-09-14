import { describe, it, expect, beforeAll } from "vitest";
import { getClient } from "../helpers.js";
import type { DosyaClient } from "../../src/index.js";

/**
 * Workspace deletion needs a code emailed to the owner, so these tests cannot
 * delete what they create. They reuse one "SDK Test" workspace across runs
 * instead of creating a new one each time (the free plan allows 3).
 */
describe("Workspaces Resource", () => {
  let client: DosyaClient;
  let testWorkspaceId: string;

  beforeAll(async () => {
    client = getClient();
    const { workspaces } = await client.workspaces.list();
    const existing = workspaces.find((ws) => ws.name.startsWith("SDK Test") && ws.roleId === "role_owner");
    if (existing) {
      testWorkspaceId = existing.id;
    } else {
      const { workspace } = await client.workspaces.create({
        name: `SDK Test ${Date.now()}`,
        iconInitials: "ST",
        iconColor: "#3B82F6",
      });
      testWorkspaceId = workspace.id;
    }
  });

  describe("list()", () => {
    it("should return workspaces with storage and account fields", async () => {
      const res = await client.workspaces.list();

      expect(res.workspaces.length).toBeGreaterThanOrEqual(1);
      const ws = res.workspaces[0];
      expect(ws.id).toBeTruthy();
      expect(ws.slug).toBeTruthy();
      expect(ws.ownerId).toBeTruthy();
      expect(ws.roleId).toBeTruthy();
      expect(ws.defaultRegion).toBeTruthy();
      expect(typeof ws.createdAt).toBe("number");
      expect(typeof ws.storage.free).toBe("number");
      expect(typeof res.allocation.planGb).toBe("number");
      expect(typeof res.userHas2fa).toBe("boolean");
      expect(ws.require2fa).toBeDefined();
    });
  });

  describe("get()", () => {
    it("should return workspace details with settings and storage", async () => {
      const result = await client.workspaces.get(testWorkspaceId);

      expect(result.workspace.id).toBe(testWorkspaceId);
      expect(result.workspace.defaultRegion).toBeTruthy();
      expect(typeof result.isOwner).toBe("boolean");
      expect(result.roleId).toBeTruthy();
      expect(result.plan).toBeTruthy();
      expect(typeof result.storage.total).toBe("number");
      expect(typeof result.planLimits.storageGb).toBe("number");
    });
  });

  describe("update()", () => {
    it("should update workspace name and icon", async () => {
      const newName = `SDK Test Updated ${Date.now()}`;
      await client.workspaces.update(testWorkspaceId, { name: newName, iconInitials: "up", iconColor: "#EF4444" });

      const { workspace } = await client.workspaces.get(testWorkspaceId);
      expect(workspace.name).toBe(newName);
      expect(workspace.iconInitials).toBe("UP");
      expect(workspace.iconColor).toBe("#EF4444");
    });
  });

  describe("settings", () => {
    it("should update and read back settings", async () => {
      await client.workspaces.updateSettings(testWorkspaceId, { maxConcurrentUploads: 5, notifyOnUpload: true });

      const { settings } = await client.workspaces.get(testWorkspaceId);
      expect(settings?.maxConcurrentUploads).toBe(5);
      expect(settings?.notifyOnUpload).toBe(1);
    });

    it("should read the share settings", async () => {
      const { settings } = await client.workspaces.getSettings(testWorkspaceId);
      if (settings) expect(settings.disableShareLinks).toBeDefined();
    });

    it("should read upload limits", async () => {
      const limits = await client.workspaces.uploadLimits(testWorkspaceId);
      expect("maxFileSizeGb" in limits).toBe(true);
    });
  });

  describe("deletePreview()", () => {
    it("should report counts and blockers", async () => {
      const preview = await client.workspaces.deletePreview(testWorkspaceId);
      expect(preview.workspaceId).toBe(testWorkspaceId);
      expect(Array.isArray(preview.blockers)).toBe(true);
    });
  });

  describe("delete()", () => {
    it("should refuse without a valid emailed code", async () => {
      const { workspace } = await client.workspaces.get(testWorkspaceId);
      await expect(
        client.workspaces.delete(testWorkspaceId, { code: "000000", confirmName: `${workspace.name} (wrong)` }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
