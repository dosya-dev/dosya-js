import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getClient, getWorkspaceId, uploadTestFile } from "../helpers.js";
import type { DosyaClient } from "../../src/index.js";

describe("Files Resource", () => {
  let client: DosyaClient;
  let workspaceId: string;
  let fileId: string;
  let folderId: string;
  const filesToCleanup: string[] = [];

  beforeAll(async () => {
    client = getClient();
    workspaceId = await getWorkspaceId(client);

    // Upload a test file
    const { result } = await uploadTestFile(client, workspaceId);
    fileId = result.file.id;

    // Create a test folder
    const { folder } = await client.folders.create({
      workspaceId,
      name: `files-test-${Date.now()}`,
    });
    folderId = folder.id;
  });

  afterAll(async () => {
    for (const id of [fileId, ...filesToCleanup]) {
      if (id) {
        try {
          // Two-stage: trash, then purge.
          const { permanent } = await client.files.delete(id);
          if (!permanent) await client.files.delete(id);
        } catch {
          /* already cleaned up */
        }
      }
    }
    if (folderId) {
      try {
        await client.folders.delete(folderId);
      } catch {
        /* already cleaned up */
      }
    }
  });

  // ─── list() ───────────────────────────────────────────

  describe("list()", () => {
    it("should list files in workspace root", async () => {
      const result = await client.files.list({ workspaceId });

      expect(Array.isArray(result.files)).toBe(true);
      expect(Array.isArray(result.folders)).toBe(true);
      expect(Array.isArray(result.breadcrumbs)).toBe(true);
      expect(result.workspaceId).toBe(workspaceId);
      expect(typeof result.canLock).toBe("boolean");
      expect(typeof result.canHide).toBe("boolean");
      expect(typeof result.folderViewOnly).toBe("boolean");
    });

    it("should include pagination metadata", async () => {
      const result = await client.files.list({ workspaceId });

      expect(result.pagination).toBeDefined();
      expect(typeof result.pagination.page).toBe("number");
      expect(typeof result.pagination.perPage).toBe("number");
      expect(typeof result.pagination.totalFiles).toBe("number");
      expect(typeof result.pagination.totalPages).toBe("number");
    });

    it("should filter by document type", async () => {
      const result = await client.files.list({
        workspaceId,
        filter: "documents",
      });
      expect(Array.isArray(result.files)).toBe(true);
    });

    it("should filter by images", async () => {
      const result = await client.files.list({
        workspaceId,
        filter: "images",
      });
      expect(Array.isArray(result.files)).toBe(true);
    });

    it("should filter by videos", async () => {
      const result = await client.files.list({
        workspaceId,
        filter: "videos",
      });
      expect(Array.isArray(result.files)).toBe(true);
    });

    it("should sort by newest", async () => {
      const result = await client.files.list({
        workspaceId,
        sort: "newest",
      });
      expect(Array.isArray(result.files)).toBe(true);
    });

    it("should sort by name ascending", async () => {
      const result = await client.files.list({
        workspaceId,
        sort: "name_asc",
      });
      expect(Array.isArray(result.files)).toBe(true);
    });

    it("should sort by largest", async () => {
      const result = await client.files.list({
        workspaceId,
        sort: "largest",
      });
      expect(Array.isArray(result.files)).toBe(true);
    });

    it("should sort by a column with a direction", async () => {
      const bySuffix = await client.files.list({ workspaceId, sort: "modified_desc" });
      const byDir = await client.files.list({ workspaceId, sort: "size", dir: "desc" });
      expect(Array.isArray(bySuffix.files)).toBe(true);
      expect(Array.isArray(byDir.files)).toBe(true);
    });

    it("should list the trash, not live files, with deleted: true", async () => {
      const trash = await client.files.list({ workspaceId, deleted: true });
      expect(trash.files.every((f) => f.deletedAt !== null)).toBe(true);
    });

    it("should paginate with custom page size", async () => {
      const result = await client.files.list({
        workspaceId,
        page: 1,
        perPage: 5,
      });

      expect(result.pagination.perPage).toBe(5);
      expect(result.pagination.page).toBe(1);
    });

    it("should list files in a specific folder", async () => {
      const result = await client.files.list({
        workspaceId,
        folderId,
      });

      expect(result.folderId).toBe(folderId);
    });

    it("should search files by query", async () => {
      const result = await client.files.list({
        workspaceId,
        q: "test",
      });
      expect(Array.isArray(result.files)).toBe(true);
    });
  });

  // ─── get() ────────────────────────────────────────────

  describe("get()", () => {
    it("should return full file details", async () => {
      const { file } = await client.files.get(fileId);

      expect(file.id).toBe(fileId);
      expect(file.name).toBeTruthy();
      expect(file.sizeBytes).toBeGreaterThan(0);
      expect(file.mimeType).toBe("text/plain");
      expect(file.workspaceId).toBe(workspaceId);
      expect(typeof file.currentVersion).toBe("number");
      expect(typeof file.createdAt).toBe("number");
      expect(typeof file.updatedAt).toBe("number");
    });
  });

  // ─── rename() ─────────────────────────────────────────

  describe("rename()", () => {
    it("should rename a file", async () => {
      const newName = `renamed-${Date.now()}.txt`;
      const result = await client.files.rename(fileId, newName);
      expect(result.name).toBe(newName);

      // Verify the change persisted
      const { file } = await client.files.get(fileId);
      expect(file.name).toBe(newName);
    });
  });

  // ─── copy() ───────────────────────────────────────────

  describe("copy()", () => {
    it("should copy a file to a specific folder, keeping its name", async () => {
      const { file: source } = await client.files.get(fileId);
      const copy = await client.files.copy(fileId, { folderId });
      filesToCleanup.push(copy.fileId);

      expect(copy.fileId).toBeTruthy();
      expect(copy.fileId).not.toBe(fileId);
      expect(copy.name).toBe(source.name);

      const { file } = await client.files.get(copy.fileId);
      expect(file.folderId).toBe(folderId);
    });

    it("should name a copy in the same folder \"Copy of ...\"", async () => {
      const { file: source } = await client.files.get(fileId);
      const copy = await client.files.copy(fileId, { folderId: source.folderId });
      filesToCleanup.push(copy.fileId);

      expect(copy.name).toBe(`Copy of ${source.name}`);
    });
  });

  // ─── move() ───────────────────────────────────────────

  describe("move()", () => {
    it("should move a file to a folder", async () => {
      const { name } = await client.files.move(fileId, folderId);
      expect(name).toBeTruthy();

      const { file } = await client.files.get(fileId);
      expect(file.folderId).toBe(folderId);
    });

    it("should move a file back to root and rename it in one step", async () => {
      const newName = `moved-${Date.now()}.txt`;
      const { name } = await client.files.move(fileId, null, { name: newName });
      expect(name).toBe(newName);

      const { file } = await client.files.get(fileId);
      expect(file.folderId).toBeNull();
      expect(file.name).toBe(newName);
    });
  });

  // ─── lock() / getLock() / unlock() ────────────────────

  describe("locks", () => {
    it("should lock a file in view_only mode", async () => {
      const { lockMode } = await client.files.lock(fileId, { lockMode: "view_only" });
      expect(lockMode).toBe("view_only");

      const info = await client.files.getLock(fileId);
      expect(info.lockMode).toBe("view_only");
    });

    it("should remove a lock with lockMode none", async () => {
      await client.files.lock(fileId, { lockMode: "none" });

      const { file } = await client.files.get(fileId);
      expect(file.lockMode).toBe("none");
    });

    it("should grant an unlock token for a full_lock file without removing the lock", async () => {
      await client.files.lock(fileId, { lockMode: "full_lock", password: "pass1234" });

      const grant = await client.files.unlock(fileId, "pass1234");
      expect(grant.unlockToken).toBeTruthy();
      expect(grant.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

      const info = await client.files.getLock(fileId);
      expect(info.lockMode).toBe("full_lock");

      await client.files.lock(fileId, { lockMode: "none" });
    });
  });

  // ─── hide() / getHide() ───────────────────────────────

  describe("hide()", () => {
    it("should hide a file from everyone and un-hide it", async () => {
      const { hiddenMode } = await client.files.hide(fileId, { hiddenMode: "everyone" });
      expect(hiddenMode).toBe("everyone");

      const info = await client.files.getHide(fileId);
      expect(info.isHidden).toBe(true);
      expect(info.hiddenMode).toBe("everyone");

      await client.files.hide(fileId, { hiddenMode: "none" });
      expect((await client.files.getHide(fileId)).isHidden).toBe(false);
    });
  });

  // ─── listVersions() ──────────────────────────────────

  describe("listVersions()", () => {
    it("should list file versions", async () => {
      const result = await client.files.listVersions(fileId);

      expect(result.fileName).toBeTruthy();
      expect(typeof result.fileSize).toBe("number");
      expect(result.fileMime).toBeTruthy();
      expect(typeof result.currentVersion).toBe("number");
      expect(Array.isArray(result.versions)).toBe(true);
      expect(result.versions.length).toBeGreaterThanOrEqual(1);

      const version = result.versions[0];
      expect(version.id).toBeTruthy();
      expect(typeof version.versionNumber).toBe("number");
      expect(typeof version.sizeBytes).toBe("number");
      expect(version.mimeType).toBeTruthy();
      expect(typeof version.createdAt).toBe("number");
    });
  });

  // ─── Share links ──────────────────────────────────────

  describe("createShareLink()", () => {
    it("should create a share link with default settings", async () => {
      const { link } = await client.files.createShareLink(fileId);

      expect(link.id).toBeTruthy();
      expect(link.token).toBeTruthy();
      expect(link.url).toBeTruthy();
      expect(link.accessMode).toBe("public");
      expect(typeof link.createdAt).toBe("number");

      await client.shares.revoke(link.id);
    });

    it("should create a share link with expiration", async () => {
      const { link } = await client.files.createShareLink(fileId, {
        expiresInDays: 7,
      });

      expect(link.expiresAt).toBeTruthy();

      await client.shares.revoke(link.id);
    });

    it("should create a password-protected share link", async () => {
      const { link } = await client.files.createShareLink(fileId, {
        password: "test1234",
        expiresInDays: 1,
      });

      const { links } = await client.files.getShareLinks(fileId);
      const found = links.find((l) => l.id === link.id);
      expect(found?.isPasswordProtected).toBeTruthy();

      await client.shares.revoke(link.id);
    });
  });

  describe("getShareLinks()", () => {
    it("should list share links for a file", async () => {
      // Create a link first
      const { link } = await client.files.createShareLink(fileId, {
        expiresInDays: 1,
      });

      const { links } = await client.files.getShareLinks(fileId);

      expect(Array.isArray(links)).toBe(true);
      expect(links.length).toBeGreaterThanOrEqual(1);

      const found = links.find((l) => l.id === link.id);
      expect(found).toBeDefined();

      await client.shares.revoke(link.id);
    });
  });

  describe("createShareBundle()", () => {
    it("should create a share bundle with one file", async () => {
      const { link, sent, failed } = await client.files.createShareBundle({
        fileIds: [fileId],
        expiresInDays: 1,
      });

      expect(sent).toBe(0);
      expect(failed).toEqual([]);

      expect(link.id).toBeTruthy();
      expect(link.token).toBeTruthy();
      expect(link.url).toBeTruthy();
      expect(link.fileCount).toBe(1);
      expect(typeof link.createdAt).toBe("number");

      await client.shares.revoke(link.id);
    });

    it("should create a password-protected share bundle", async () => {
      const { link } = await client.files.createShareBundle({
        fileIds: [fileId],
        password: "bundle-pass",
        expiresInDays: 1,
      });

      expect(link.id).toBeTruthy();

      await client.shares.revoke(link.id);
    });
  });

  // ─── batchDelete() / duplicates() ─────────────────────

  describe("batchDelete()", () => {
    it("should move files to the trash", async () => {
      const { result } = await uploadTestFile(client, workspaceId, {
        fileName: `batch-delete-${Date.now()}.txt`,
      });

      const res = await client.files.batchDelete({ workspaceId, fileIds: [result.file.id] });
      expect(res.deleted).toBe(1);
      expect(res.foldersDeleted).toBe(0);

      const trash = await client.files.list({ workspaceId, deleted: true });
      expect(trash.files.some((f) => f.id === result.file.id)).toBe(true);

      // Second delete on a trashed file purges it.
      expect((await client.files.delete(result.file.id)).permanent).toBe(true);
    });
  });

  describe("duplicates()", () => {
    it("should report duplicate groups", async () => {
      const res = await client.files.duplicates(workspaceId);
      expect(typeof res.scanEnabled).toBe("boolean");
      expect(Array.isArray(res.groups)).toBe(true);
      expect(typeof res.totalGroups).toBe("number");
      expect(typeof res.scanning.pending).toBe("number");
    });
  });

  // ─── delete() and restore() ───────────────────────────

  describe("delete() and restore()", () => {
    it("should trash, restore, then trash and purge a file", async () => {
      const { result } = await uploadTestFile(client, workspaceId, {
        fileName: `delete-test-${Date.now()}.txt`,
      });

      expect((await client.files.delete(result.file.id)).permanent).toBe(false);

      const trash = await client.files.list({ workspaceId, deleted: true });
      expect(trash.files.some((f) => f.id === result.file.id)).toBe(true);

      await expect(client.files.restore(result.file.id)).resolves.toBeUndefined();
      const { file } = await client.files.get(result.file.id);
      expect(file.deletedAt).toBeNull();

      expect((await client.files.delete(result.file.id)).permanent).toBe(false);
      expect((await client.files.delete(result.file.id)).permanent).toBe(true);
    });
  });
});
