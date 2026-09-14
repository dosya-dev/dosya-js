import { describe, it, expect } from "vitest";
import { FilesResource } from "../../src/resources/files.js";
import { DosyaApiError } from "../../src/errors.js";
import { mockApi, ok, fail } from "./_mock.js";

function setup(routes: Parameters<typeof mockApi>[0], httpOptions?: Parameters<ReturnType<typeof mockApi>["http"]>[0]) {
  const api = mockApi(routes);
  return { api, files: new FilesResource(api.http(httpOptions)) };
}

describe("FilesResource", () => {
  describe("list()", () => {
    it("sends deleted/hidden as 1, not true (regression)", async () => {
      const { api, files } = setup({
        "GET /api/files": ok({ folders: [], files: [], breadcrumbs: [], workspace_id: "ws_1", folder_id: null }),
      });
      await files.list({ workspaceId: "ws_1", deleted: true, hidden: true, folder: "fo_trash" });
      expect(api.calls[0].query).toEqual({ workspace_id: "ws_1", deleted: "1", hidden: "1", folder: "fo_trash" });
    });

    it("omits deleted/hidden when false and drops folder outside the trash", async () => {
      const { api, files } = setup({ "GET /api/files": ok({}) });
      await files.list({ workspaceId: "ws_1", deleted: false, hidden: false, folder: "fo_x" });
      expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    });

    it("sends every listing parameter with the handler's names", async () => {
      const { api, files } = setup({ "GET /api/files": ok({}) });
      await files.list({
        workspaceId: "ws_1",
        folderId: "fo_1",
        filter: "images",
        sort: "taken",
        dir: "asc",
        q: "cat",
        unlockToken: "tok",
        groupId: "grp_1",
        page: 2,
        perPage: 50,
      });
      expect(api.calls[0].query).toEqual({
        workspace_id: "ws_1",
        folder_id: "fo_1",
        filter: "images",
        sort: "taken",
        dir: "asc",
        q: "cat",
        ut: "tok",
        group_id: "grp_1",
        page: "2",
        per_page: "50",
      });
    });

    it("camelCases folder and file rows", async () => {
      const { files } = setup({
        "GET /api/files": ok({
          folders: [{ id: "fo_1", name: "A", uploader_name: "Ada", total_size_bytes: 10, content_updated_at: 5, share_count: 0 }],
          files: [{ id: "f_1", name: "a.jpg", captured_at: "2026-01-01T10:00:00", content_hash: "h", import_account_email: null }],
          breadcrumbs: [],
          workspace_id: "ws_1",
          folder_id: null,
          can_lock: true,
          can_hide: false,
          folder_view_only: false,
          pagination: { page: 1, per_page: 100, total_files: 1, total_pages: 1 },
        }),
      });
      const res = await files.list({ workspaceId: "ws_1" });
      expect(res.folders[0]).toMatchObject({ uploaderName: "Ada", totalSizeBytes: 10, contentUpdatedAt: 5, shareCount: 0 });
      expect(res.files[0]).toMatchObject({ capturedAt: "2026-01-01T10:00:00", contentHash: "h", importAccountEmail: null });
      expect(res.pagination).toEqual({ page: 1, perPage: 100, totalFiles: 1, totalPages: 1 });
      expect(res.folderViewOnly).toBe(false);
    });

    it("surfaces a locked folder as DosyaApiError with its details", async () => {
      const { files } = setup({
        "GET /api/files": fail(403, "folder_locked", { folder_id: "fo_1", lock_mode: "full_lock" }),
      });
      const err = await files.list({ workspaceId: "ws_1", folderId: "fo_1" }).catch((e) => e);
      expect(err).toBeInstanceOf(DosyaApiError);
      expect(err.status).toBe(403);
      expect(err.errorMessage).toBe("folder_locked");
    });
  });

  describe("get()", () => {
    it("GETs the file with the id path-encoded", async () => {
      const { api, files } = setup({
        "GET /api/files/f%2F1": ok({ file: { id: "f/1", share_count: 2, comment_count: 1, uploader_name: null, etag: "e" } }),
      });
      const { file } = await files.get("f/1");
      expect(api.calls[0].path).toBe("/api/files/f%2F1");
      expect(file).toMatchObject({ id: "f/1", shareCount: 2, commentCount: 1, uploaderName: null, etag: "e" });
    });

    it("rejects dot-segment ids before sending", async () => {
      const { api, files } = setup({});
      await expect(files.get("..")).rejects.toThrow(TypeError);
      await expect(files.get("")).rejects.toThrow(TypeError);
      expect(api.calls).toHaveLength(0);
    });
  });

  describe("delete()", () => {
    it("DELETEs and returns permanent", async () => {
      const { api, files } = setup({ "DELETE /api/files/f_1": ok({ permanent: false }) });
      expect(await files.delete("f_1")).toEqual({ permanent: false });
      expect(api.calls[0].method).toBe("DELETE");
    });

    it("is not retried on 5xx, so a replay cannot purge", async () => {
      const { api, files } = setup(
        { "DELETE /api/files/f_1": [fail(500, "boom"), ok({ permanent: true })] },
        { retry: { maxRetries: 3, baseDelay: 1, maxDelay: 5 } },
      );
      await expect(files.delete("f_1")).rejects.toBeInstanceOf(DosyaApiError);
      expect(api.calls).toHaveLength(1);
    });
  });

  it("restore() PUTs /api/files/:id", async () => {
    const { api, files } = setup({ "PUT /api/files/f_1": ok() });
    await expect(files.restore("f_1")).resolves.toBeUndefined();
    expect(api.calls[0]).toMatchObject({ method: "PUT", path: "/api/files/f_1" });
  });

  it("rename() PUTs {name}", async () => {
    const { api, files } = setup({ "PUT /api/files/f_1/rename": ok({ name: "b.txt" }) });
    expect(await files.rename("f_1", "b.txt")).toEqual({ name: "b.txt" });
    expect(api.calls[0].body).toEqual({ name: "b.txt" });
  });

  describe("move()", () => {
    it("sends folder_id and returns the name", async () => {
      const { api, files } = setup({ "PUT /api/files/f_1/move": ok({ name: "a.txt" }) });
      expect(await files.move("f_1", "fo_2")).toEqual({ name: "a.txt" });
      expect(api.calls[0].body).toEqual({ folder_id: "fo_2" });
    });

    it("keeps folder_id null for root and supports an atomic rename", async () => {
      const { api, files } = setup({ "PUT /api/files/f_1/move": ok({ name: "b.txt" }) });
      await files.move("f_1", null, { name: "b.txt" });
      expect(api.calls[0].body).toEqual({ folder_id: null, name: "b.txt" });
    });
  });

  describe("copy()", () => {
    it("sends only folder_id and returns {fileId, name} (regression)", async () => {
      const { api, files } = setup({ "POST /api/files/f_1/copy": ok({ file_id: "f_2", name: "Copy of a.txt" }, 201) });
      const res = await files.copy("f_1", { folderId: "fo_1" });
      expect(res).toEqual({ fileId: "f_2", name: "Copy of a.txt" });
      expect(api.calls[0].body).toEqual({ folder_id: "fo_1" });
    });

    it("defaults to the root", async () => {
      const { api, files } = setup({ "POST /api/files/f_1/copy": ok({ file_id: "f_2", name: "a.txt" }, 201) });
      await files.copy("f_1");
      expect(api.calls[0].body).toEqual({ folder_id: null });
    });
  });

  describe("locks", () => {
    it("getLock() GETs the lock state", async () => {
      const { api, files } = setup({
        "GET /api/files/f_1/lock": ok({ lock_mode: "view_only", locked_by: "u_1", locked_by_name: "Ada", locked_at: 9 }),
      });
      expect(await files.getLock("f_1")).toEqual({ lockMode: "view_only", lockedBy: "u_1", lockedByName: "Ada", lockedAt: 9 });
      expect(api.calls[0].method).toBe("GET");
    });

    it("lock() sends lock_mode + password and returns lockMode", async () => {
      const { api, files } = setup({ "POST /api/files/f_1/lock": ok({ lock_mode: "full_lock" }) });
      expect(await files.lock("f_1", { lockMode: "full_lock", password: "abcd" })).toEqual({ lockMode: "full_lock" });
      expect(api.calls[0].body).toEqual({ lock_mode: "full_lock", password: "abcd" });
    });

    it("lock() with none removes the lock", async () => {
      const { api, files } = setup({ "POST /api/files/f_1/lock": ok({ lock_mode: "none" }) });
      await files.lock("f_1", { lockMode: "none" });
      expect(api.calls[0].body).toEqual({ lock_mode: "none" });
    });

    it("unlock() sends the password and returns the grant (regression)", async () => {
      const { api, files } = setup({ "POST /api/files/f_1/unlock": ok({ unlock_token: "ut_1", expires_at: 1700 }) });
      expect(await files.unlock("f_1", "secret")).toEqual({ unlockToken: "ut_1", expiresAt: 1700 });
      expect(api.calls[0].body).toEqual({ password: "secret" });
    });
  });

  describe("hide", () => {
    it("hide() sends hidden_mode + targets, not target_ids (regression)", async () => {
      const { api, files } = setup({ "POST /api/files/f_1/hide": ok({ hidden_mode: "users" }) });
      expect(await files.hide("f_1", { hiddenMode: "users", targets: ["u_1", "u_2"] })).toEqual({ hiddenMode: "users" });
      expect(api.calls[0].body).toEqual({ hidden_mode: "users", targets: ["u_1", "u_2"] });
    });

    it("hide() always sends hidden_mode (a missing mode un-hides on the server)", async () => {
      const { api, files } = setup({ "POST /api/files/f_1/hide": ok({ hidden_mode: "everyone" }) });
      await files.hide("f_1", { hiddenMode: "everyone" });
      expect(api.calls[0].body).toEqual({ hidden_mode: "everyone" });
    });

    it("getHide() camelCases rules", async () => {
      const { files } = setup({
        "GET /api/files/f_1/hide": ok({ is_hidden: true, hidden_mode: "roles", rules: [{ target_type: "role", target_id: "r_1" }] }),
      });
      expect(await files.getHide("f_1")).toEqual({
        isHidden: true,
        hiddenMode: "roles",
        rules: [{ targetType: "role", targetId: "r_1" }],
      });
    });
  });

  describe("versions", () => {
    it("listVersions() returns file fields and versions", async () => {
      const { files } = setup({
        "GET /api/files/f_1/versions": ok({
          file_name: "a.txt",
          file_size: 3,
          file_mime: "text/plain",
          file_created: 1,
          current_version: 1,
          versions: [{ id: "fver_implicit_f_1", version_number: 1, size_bytes: 3, uploader_name: null }],
        }),
      });
      const res = await files.listVersions("f_1");
      expect(res).toMatchObject({ fileName: "a.txt", fileSize: 3, fileMime: "text/plain", fileCreated: 1, currentVersion: 1 });
      expect(res.versions[0]).toMatchObject({ id: "fver_implicit_f_1", versionNumber: 1, sizeBytes: 3 });
    });

    it("restoreVersion() sends version_number", async () => {
      const { api, files } = setup({ "POST /api/files/f_1/versions/restore": ok({ version: 3, restored_from: 1 }) });
      expect(await files.restoreVersion("f_1", 1)).toEqual({ version: 3, restoredFrom: 1 });
      expect(api.calls[0].body).toEqual({ version_number: 1 });
    });
  });

  describe("sharing", () => {
    it("getShareLinks() GETs /share", async () => {
      const { api, files } = setup({
        "GET /api/files/f_1/share": ok({ links: [{ id: "sl_1", view_count: 2, is_revoked: 0, url: "https://x/s/t" }] }),
      });
      const { links } = await files.getShareLinks("f_1");
      expect(links[0]).toMatchObject({ id: "sl_1", viewCount: 2, isRevoked: 0, url: "https://x/s/t" });
      expect(api.calls[0].method).toBe("GET");
    });

    it("createShareLink() sends the allowlisted body and returns the created link", async () => {
      const { api, files } = setup({
        "POST /api/files/f_1/share": ok({ link: { id: "sl_1", token: "t", url: "u", lock_mode: "none", access_mode: "restricted", expires_at: null, created_at: 1 } }, 201),
      });
      const { link } = await files.createShareLink("f_1", {
        accessMode: "restricted",
        recipientEmails: ["a@b.c"],
        maxDownloads: 5,
        expiresAt: 99,
      });
      expect(link).toMatchObject({ accessMode: "restricted", lockMode: "none" });
      expect(api.calls[0].body).toEqual({ access_mode: "restricted", recipient_emails: ["a@b.c"], max_downloads: 5, expires_at: 99 });
    });

    it("shareByEmail() returns the result instead of void (regression)", async () => {
      const { api, files } = setup({
        "POST /api/files/f_1/share-email": ok({ share_url: "https://x/s/t", access_mode: "public", sent: 1, failed: ["bad@x.y"] }, 201),
      });
      const res = await files.shareByEmail("f_1", { emails: ["a@b.c", "bad@x.y"], message: "hi", restrictToRecipients: true });
      expect(res).toEqual({ shareUrl: "https://x/s/t", accessMode: "public", sent: 1, failed: ["bad@x.y"] });
      expect(api.calls[0].body).toEqual({ emails: ["a@b.c", "bad@x.y"], message: "hi", restrict_to_recipients: true });
    });

    it("createShareBundle() sends only allowlisted keys and returns sent/failed", async () => {
      const { api, files } = setup({
        "POST /api/files/share-bundle": ok(
          { sent: 1, failed: [], link: { id: "sl_1", token: "t", url: "u", lock_mode: "none", access_mode: "restricted", file_count: 2, expires_at: null, created_at: 1 } },
          201,
        ),
      });
      const params = {
        fileIds: ["f_1", "f_2"],
        accessMode: "restricted" as const,
        recipientEmails: ["a@b.c"],
        notify: true,
        message: "hello",
        expiresInDays: 3,
        password: "longenough",
        maxDownloads: 4,
      };
      const res = await files.createShareBundle(params);
      expect(res).toEqual({
        sent: 1,
        failed: [],
        link: { id: "sl_1", token: "t", url: "u", lockMode: "none", accessMode: "restricted", fileCount: 2, expiresAt: null, createdAt: 1 },
      });
      expect(api.calls[0].body).toEqual({
        file_ids: ["f_1", "f_2"],
        access_mode: "restricted",
        recipient_emails: ["a@b.c"],
        notify: true,
        message: "hello",
        expires_in_days: 3,
        password: "longenough",
      });
    });
  });

  it("batchDelete() POSTs workspace_id, file_ids, folder_ids", async () => {
    const { api, files } = setup({ "POST /api/files/batch-delete": ok({ deleted: 2, folders_deleted: 1 }) });
    expect(await files.batchDelete({ workspaceId: "ws_1", fileIds: ["f_1", "f_2"], folderIds: ["fo_1"] })).toEqual({
      deleted: 2,
      foldersDeleted: 1,
    });
    expect(api.calls[0]).toMatchObject({
      method: "POST",
      body: { workspace_id: "ws_1", file_ids: ["f_1", "f_2"], folder_ids: ["fo_1"] },
    });
  });

  it("duplicates() GETs /api/duplicates and camelCases groups", async () => {
    const { api, files } = setup({
      "GET /api/duplicates": ok({
        scan_enabled: true,
        groups: [{ content_hash: "h", size_bytes: 5, count: 2, wasted_bytes: 5, files: [{ id: "f_1", folder_path: null, uploader_name: "Ada" }] }],
        total_groups: 1,
        total_wasted_bytes: 5,
        scanning: { pending: 0 },
      }),
    });
    const res = await files.duplicates("ws_1");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    expect(res).toMatchObject({ scanEnabled: true, totalGroups: 1, totalWastedBytes: 5, scanning: { pending: 0 } });
    expect(res.groups[0]).toMatchObject({ contentHash: "h", wastedBytes: 5 });
    expect(res.groups[0].files[0]).toMatchObject({ folderPath: null, uploaderName: "Ada" });
  });
});
