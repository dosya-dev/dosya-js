import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getClient, getWorkspaceId } from "../helpers.js";
import type { DosyaClient } from "../../src/index.js";

describe("Folders Resource", () => {
  let client: DosyaClient;
  let workspaceId: string;
  let folderId: string;
  let childFolderId: string;

  beforeAll(async () => {
    client = getClient();
    workspaceId = await getWorkspaceId(client);
  });

  afterAll(async () => {
    // Trashing the parent sweeps the child with it; purge() then empties the trash.
    if (folderId) {
      try {
        await client.folders.lock(folderId, { lockMode: "none" });
      } catch {
        /* not locked or already gone */
      }
      try {
        await client.folders.delete(folderId);
        await client.folders.purge(folderId);
      } catch {
        /* already cleaned up */
      }
    }
  });

  describe("create()", () => {
    it("should create a folder at root level", async () => {
      const name = `test-folder-${Date.now()}`;
      const result = await client.folders.create({ workspaceId, name });

      folderId = result.folder.id;

      expect(result.folder.id).toBeTruthy();
      expect(result.folder.name).toBe(name);
      expect(result.folder.workspaceId).toBe(workspaceId);
      expect(result.createdCount).toBe(1);
      expect(Array.isArray(result.createdFolders)).toBe(true);
    });

    it("should create a nested folder inside a parent", async () => {
      const name = `child-folder-${Date.now()}`;
      const result = await client.folders.create({
        workspaceId,
        parentId: folderId,
        name,
      });

      childFolderId = result.folder.id;

      expect(result.folder.name).toBe(name);
      expect(result.folder.parentId).toBe(folderId);
    });

    it("should create nested folders from a path-like name", async () => {
      const name = `path-test-${Date.now()}/sub/deep`;
      const result = await client.folders.create({ workspaceId, name });

      expect(result.createdCount).toBe(3);
      expect(result.folder.name).toBe("deep");

      // Idempotent: the same path again creates nothing and resolves to the same leaf.
      const again = await client.folders.create({ workspaceId, name });
      expect(again.createdCount).toBe(0);
      expect(again.folder.id).toBe(result.folder.id);

      const topFolder = result.createdFolders[0];
      await client.folders.delete(topFolder.id);
      await client.folders.purge(topFolder.id);
    });
  });

  describe("get()", () => {
    it("should return folder details", async () => {
      const { folder } = await client.folders.get(folderId);

      expect(folder.id).toBe(folderId);
      expect(folder.name).toBeTruthy();
      expect(folder.workspaceId).toBe(workspaceId);
      expect(typeof folder.createdAt).toBe("number");
      expect(typeof folder.updatedAt).toBe("number");
      expect(Number(folder.isDeleted)).toBe(0);
    });
  });

  describe("rename()", () => {
    it("should rename a folder", async () => {
      const newName = `renamed-folder-${Date.now()}`;
      const result = await client.folders.rename(folderId, newName);

      expect(result.name).toBe(newName);
    });
  });

  describe("children() and search()", () => {
    it("should list root children with hasChildren", async () => {
      const { folders } = await client.folders.children(workspaceId);
      const found = folders.find((f) => f.id === folderId);
      expect(found).toBeDefined();
      expect(Number(found!.hasChildren)).toBe(1);
    });

    it("should list a folder's children", async () => {
      const { folders } = await client.folders.children(workspaceId, folderId);
      expect(folders.some((f) => f.id === childFolderId)).toBe(true);
    });

    it("should find folders by name with a breadcrumb path", async () => {
      const { folder } = await client.folders.get(childFolderId);
      const { folders } = await client.folders.search(workspaceId, folder.name);
      const hit = folders.find((f) => f.id === childFolderId);
      expect(hit).toBeDefined();
      expect(typeof hit!.path).toBe("string");
    });
  });

  describe("createBatch()", () => {
    it("should find-or-create folders under a parent", async () => {
      const { folders } = await client.folders.createBatch(workspaceId, [
        { name: "batch-a", parentId: folderId },
        { name: "batch-a", parentId: folderId },
      ]);
      expect(folders).toHaveLength(2);
      expect(folders[0].created).toBe(true);
      expect(folders[1].created).toBe(false);
      expect(folders[1].id).toBe(folders[0].id);
    });
  });

  describe("tree()", () => {
    it("should return folder tree for workspace", async () => {
      const { folders } = await client.folders.tree(workspaceId);

      expect(Array.isArray(folders)).toBe(true);

      // Our created folder should be in the tree
      const found = folders.find((f) => f.id === folderId);
      expect(found).toBeDefined();
      expect(typeof found!.fileCount).toBe("number");
    });
  });

  describe("lock(), getLock() and unlock()", () => {
    it("should lock a folder in view_only mode", async () => {
      const res = await client.folders.lock(folderId, { lockMode: "view_only" });
      expect(res.lockMode).toBe("view_only");
      const info = await client.folders.getLock(folderId);
      expect(info.lockMode).toBe("view_only");
    });

    it("should remove a lock with lockMode none", async () => {
      const res = await client.folders.lock(folderId, { lockMode: "none" });
      expect(res.lockMode).toBe("none");
    });

    it("should lock in full_lock mode and grant access with the password", async () => {
      await client.folders.lock(folderId, { lockMode: "full_lock", password: "sdk-test-pass" });
      const grant = await client.folders.unlock(folderId, "sdk-test-pass");
      expect(grant.unlockToken).toMatch(/^ut_/);
      expect(typeof grant.expiresAt).toBe("number");

      // unlock() grants access only; remove the lock for subsequent tests.
      await client.folders.lock(folderId, { lockMode: "none" });
    });
  });

  describe("hide() and getHide()", () => {
    it("should hide from everyone and unhide", async () => {
      expect((await client.folders.hide(childFolderId, { hiddenMode: "everyone" })).hiddenMode).toBe("everyone");
      expect((await client.folders.getHide(childFolderId)).hiddenMode).toBe("everyone");
      expect((await client.folders.hide(childFolderId, { hiddenMode: "none" })).hiddenMode).toBe("none");
    });
  });

  describe("move()", () => {
    it("should move a folder to root", async () => {
      await expect(
        client.folders.move(childFolderId, null),
      ).resolves.toBeUndefined();
    });

    it("should move a folder back into a parent", async () => {
      await expect(
        client.folders.move(childFolderId, folderId),
      ).resolves.toBeUndefined();

      // Verify parent changed
      const { folder } = await client.folders.get(childFolderId);
      expect(folder.parentId).toBe(folderId);
    });
  });

  describe("rename() on a trashed folder", () => {
    it("should not restore or touch a trashed folder (regression)", async () => {
      const { folder } = await client.folders.create({ workspaceId, name: `rename-trash-${Date.now()}` });
      await client.folders.delete(folder.id);
      await expect(client.folders.rename(folder.id, "nope")).rejects.toThrow();
      const { folder: after } = await client.folders.get(folder.id);
      expect(Number(after.isDeleted)).toBe(1);
      await client.folders.purge(folder.id);
    });
  });

  describe("delete(), restore() and purge()", () => {
    it("should trash, restore, trash again and purge", async () => {
      const { folder } = await client.folders.create({
        workspaceId,
        name: `delete-test-${Date.now()}`,
      });

      const trashed = await client.folders.delete(folder.id);
      expect(trashed.permanent).toBe(false);
      if (!trashed.permanent) expect(trashed.foldersRemoved).toBeGreaterThanOrEqual(1);

      const restored = await client.folders.restore(folder.id);
      expect(restored.folderId).toBe(folder.id);
      expect(restored.foldersRestored).toBeGreaterThanOrEqual(1);

      await expect(client.folders.purge(folder.id)).rejects.toThrow(/not in the trash/);

      await client.folders.delete(folder.id);
      const summary = await client.folders.purge(folder.id);
      expect(summary.passes).toBeGreaterThanOrEqual(1);
      await expect(client.folders.get(folder.id)).rejects.toThrow();
    });
  });
});
