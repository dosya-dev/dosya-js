import { describe, it, expect } from "vitest";
import { FoldersResource } from "../../src/resources/folders.js";
import { DosyaApiError, DosyaError } from "../../src/errors.js";
import { mockApi, ok, fail } from "./_mock.js";

function setup(routes: Parameters<typeof mockApi>[0], httpOpts: Parameters<ReturnType<typeof mockApi>["http"]>[0] = {}) {
  const api = mockApi(routes);
  return { api, folders: new FoldersResource(api.http(httpOpts)) };
}

describe("folders.create", () => {
  it("POSTs snake_case body and camelCases the result", async () => {
    const { api, folders } = setup({
      "POST /api/folders": ok(
        {
          folder: { id: "fld_c", name: "c", parent_id: "fld_b", workspace_id: "ws_1" },
          created_count: 2,
          created_folders: [
            { id: "fld_b", name: "b", parent_id: "fld_a" },
            { id: "fld_c", name: "c", parent_id: "fld_b" },
          ],
        },
        201,
      ),
    });
    const res = await folders.create({ workspaceId: "ws_1", parentId: "fld_a", name: "b/c" });
    expect(api.calls[0].method).toBe("POST");
    expect(api.calls[0].path).toBe("/api/folders");
    expect(api.calls[0].body).toEqual({ workspace_id: "ws_1", parent_id: "fld_a", name: "b/c" });
    expect(res.folder).toEqual({ id: "fld_c", name: "c", parentId: "fld_b", workspaceId: "ws_1" });
    expect(res.createdCount).toBe(2);
    expect(res.createdFolders[1]).toEqual({ id: "fld_c", name: "c", parentId: "fld_b" });
  });
});

describe("folders.createBatch", () => {
  it("sends folders with parent_id null default", async () => {
    const { api, folders } = setup({
      "POST /api/folders/batch": ok({ folders: [{ name: "x", parent_id: null, id: "fld_x", created: true }] }),
    });
    const res = await folders.createBatch("ws_1", [{ name: "x" }, { name: "y", parentId: "fld_p" }]);
    expect(api.calls[0].body).toEqual({
      workspace_id: "ws_1",
      folders: [
        { name: "x", parent_id: null },
        { name: "y", parent_id: "fld_p" },
      ],
    });
    expect(res.folders).toEqual([{ name: "x", parentId: null, id: "fld_x", created: true }]);
  });
});

describe("folders.get", () => {
  it("GETs by encoded id and returns the full detail", async () => {
    const { api, folders } = setup({
      "GET /api/folders/fld%2F1": ok({
        folder: {
          id: "fld/1", name: "Docs", workspace_id: "ws_1", parent_id: null,
          is_synced: 0, is_deleted: 1, trash_root_id: "fld/1", created_at: 1, updated_at: 2,
        },
      }),
    });
    const { folder } = await folders.get("fld/1");
    expect(api.calls[0].path).toBe("/api/folders/fld%2F1");
    expect(folder).toEqual({
      id: "fld/1", name: "Docs", workspaceId: "ws_1", parentId: null,
      isSynced: 0, isDeleted: 1, trashRootId: "fld/1", createdAt: 1, updatedAt: 2,
    });
  });

  it("rejects dot-segment ids", async () => {
    const { folders } = setup({});
    await expect(folders.get("..")).rejects.toThrow(TypeError);
  });
});

describe("folders.rename", () => {
  it("regression: PUTs /rename, not the restore route", async () => {
    const { api, folders } = setup({
      "PUT /api/folders/fld_1/rename": ok({ name: "New" }),
      "PUT /api/folders/fld_1": ok({ folder_id: "fld_1", name: "Old", restored_to_root: false, files_restored: 0, folders_restored: 1 }),
    });
    const res = await folders.rename("fld_1", "New");
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].method).toBe("PUT");
    expect(api.calls[0].path).toBe("/api/folders/fld_1/rename");
    expect(api.calls[0].body).toEqual({ name: "New" });
    expect(res).toEqual({ name: "New" });
  });
});

describe("folders.restore", () => {
  it("PUTs /api/folders/:id with no body", async () => {
    const { api, folders } = setup({
      "PUT /api/folders/fld_1": ok({ folder_id: "fld_1", name: "Docs (1)", restored_to_root: true, files_restored: 3, folders_restored: 2 }),
    });
    const res = await folders.restore("fld_1");
    expect(api.calls[0].method).toBe("PUT");
    expect(api.calls[0].body).toBeUndefined();
    expect(res).toEqual({ folderId: "fld_1", name: "Docs (1)", restoredToRoot: true, filesRestored: 3, foldersRestored: 2 });
  });
});

describe("folders.delete", () => {
  it("returns the trash branch of the union", async () => {
    const { api, folders } = setup({
      "DELETE /api/folders/fld_1": ok({ permanent: false, files_affected: 4, folders_removed: 2 }),
    });
    const res = await folders.delete("fld_1");
    expect(api.calls[0].method).toBe("DELETE");
    expect(api.calls[0].query).toEqual({});
    expect(res).toEqual({ permanent: false, filesAffected: 4, foldersRemoved: 2 });
    if (!res.permanent) expect(res.foldersRemoved).toBe(2);
  });

  it("returns a partial purge (202) and sends max_r2_calls", async () => {
    const { api, folders } = setup({
      "DELETE /api/folders/fld_1": ok({ permanent: true, complete: false, remaining: 10, files_affected: 5 }, 202),
    });
    const res = await folders.delete("fld_1", { maxR2Calls: 20 });
    expect(api.calls[0].query).toEqual({ max_r2_calls: "20" });
    expect(res).toEqual({ permanent: true, complete: false, remaining: 10, filesAffected: 5 });
  });

  it("never retries, even when the client is configured to", async () => {
    const { api, folders } = setup(
      { "DELETE /api/folders/fld_1": [fail(500, "boom"), ok({ permanent: true, complete: true, remaining: 0, files_affected: 1 })] },
      { retry: { maxRetries: 3, baseDelay: 1, maxDelay: 5 } },
    );
    await expect(folders.delete("fld_1")).rejects.toBeInstanceOf(DosyaApiError);
    expect(api.calls).toHaveLength(1);
  });
});

describe("folders.purge", () => {
  const trashed = ok({
    folder: { id: "fld_1", name: "a", workspace_id: "ws", parent_id: null, is_synced: 0, is_deleted: 1, trash_root_id: "fld_1", created_at: 1, updated_at: 1 },
  });

  it("refuses a live folder without calling DELETE", async () => {
    const { api, folders } = setup({
      "GET /api/folders/fld_1": ok({
        folder: { id: "fld_1", name: "a", workspace_id: "ws", parent_id: null, is_synced: 0, is_deleted: 0, trash_root_id: null, created_at: 1, updated_at: 1 },
      }),
    });
    await expect(folders.purge("fld_1")).rejects.toBeInstanceOf(DosyaError);
    expect(api.calls.map((c) => c.method)).toEqual(["GET"]);
  });

  it("loops until the purge completes", async () => {
    const { api, folders } = setup({
      "GET /api/folders/fld_1": trashed,
      "DELETE /api/folders/fld_1": [
        ok({ permanent: true, complete: false, remaining: 3, files_affected: 5 }, 202),
        ok({ permanent: true, complete: true, remaining: 0, files_affected: 3 }),
      ],
    });
    const res = await folders.purge("fld_1", { maxR2Calls: 7 });
    expect(res).toEqual({ filesAffected: 8, passes: 2 });
    expect(api.calls.filter((c) => c.method === "DELETE")).toHaveLength(2);
    expect(api.calls[1].query).toEqual({ max_r2_calls: "7" });
  });

  it("stops when a pass trashed instead of purged", async () => {
    const { folders } = setup({
      "GET /api/folders/fld_1": trashed,
      "DELETE /api/folders/fld_1": ok({ permanent: false, files_affected: 0, folders_removed: 1 }),
    });
    await expect(folders.purge("fld_1")).rejects.toThrow(/not performed/);
  });

  it("gives up after maxPasses", async () => {
    const { api, folders } = setup({
      "GET /api/folders/fld_1": trashed,
      "DELETE /api/folders/fld_1": ok({ permanent: true, complete: false, remaining: 3, files_affected: 1 }, 202),
    });
    await expect(folders.purge("fld_1", { maxPasses: 2 })).rejects.toThrow(/2 passes/);
    expect(api.calls.filter((c) => c.method === "DELETE")).toHaveLength(2);
  });
});

describe("folders.move", () => {
  it("PUTs parent_id, null for root", async () => {
    const { api, folders } = setup({ "PUT /api/folders/fld_1/move": ok() });
    await expect(folders.move("fld_1", null)).resolves.toBeUndefined();
    expect(api.calls[0].body).toEqual({ parent_id: null });
  });
});

describe("folders listing", () => {
  it("tree sends workspace_id", async () => {
    const { api, folders } = setup({
      "GET /api/folders/tree": ok({ folders: [{ id: "f", name: "n", parent_id: null, file_count: 2 }] }),
    });
    const res = await folders.tree("ws_1");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    expect(res.folders[0]).toEqual({ id: "f", name: "n", parentId: null, fileCount: 2 });
  });

  it("children sends parent_id only when given", async () => {
    const { api, folders } = setup({
      "GET /api/folders/children": ok({ folders: [{ id: "f", name: "n", parent_id: "p", file_count: 0, has_children: 1 }] }),
    });
    await folders.children("ws_1");
    const res = await folders.children("ws_1", "p");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    expect(api.calls[1].query).toEqual({ workspace_id: "ws_1", parent_id: "p" });
    expect(res.folders[0].hasChildren).toBe(1);
  });

  it("search sends q and returns path", async () => {
    const { api, folders } = setup({
      "GET /api/folders/search": ok({ folders: [{ id: "f", name: "inv", file_count: 1, path: "A / B" }] }),
    });
    const res = await folders.search("ws_1", "inv");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1", q: "inv" });
    expect(res.folders[0]).toEqual({ id: "f", name: "inv", fileCount: 1, path: "A / B" });
  });
});

describe("folders lock", () => {
  it("getLock camelCases", async () => {
    const { folders } = setup({
      "GET /api/folders/fld_1/lock": ok({ lock_mode: "view_only", locked_by: "u", locked_by_name: "U", locked_at: 5 }),
    });
    expect(await folders.getLock("fld_1")).toEqual({ lockMode: "view_only", lockedBy: "u", lockedByName: "U", lockedAt: 5 });
  });

  it("lock returns lockMode and supports none", async () => {
    const { api, folders } = setup({ "POST /api/folders/fld_1/lock": ok({ lock_mode: "none" }) });
    const res = await folders.lock("fld_1", { lockMode: "none" });
    expect(api.calls[0].body).toEqual({ lock_mode: "none" });
    expect(res).toEqual({ lockMode: "none" });
  });

  it("lock sends the password for full_lock", async () => {
    const { api, folders } = setup({ "POST /api/folders/fld_1/lock": ok({ lock_mode: "full_lock" }) });
    await folders.lock("fld_1", { lockMode: "full_lock", password: "secret" });
    expect(api.calls[0].body).toEqual({ lock_mode: "full_lock", password: "secret" });
  });

  it("regression: unlock sends the password body and returns the grant", async () => {
    const { api, folders } = setup({
      "POST /api/folders/fld_1/unlock": ok({ unlock_token: "ut_abc", expires_at: 99 }),
    });
    const res = await folders.unlock("fld_1", "secret");
    expect(api.calls[0].body).toEqual({ password: "secret" });
    expect(res).toEqual({ unlockToken: "ut_abc", expiresAt: 99 });
  });
});

describe("folders hide", () => {
  it("getHide camelCases rules", async () => {
    const { folders } = setup({
      "GET /api/folders/fld_1/hide": ok({ is_hidden: true, hidden_mode: "users", rules: [{ target_type: "user", target_id: "u1" }] }),
    });
    expect(await folders.getHide("fld_1")).toEqual({
      isHidden: true, hiddenMode: "users", rules: [{ targetType: "user", targetId: "u1" }],
    });
  });

  it("hide sends `targets` (not target_ids) for users/roles", async () => {
    const { api, folders } = setup({ "POST /api/folders/fld_1/hide": ok({ hidden_mode: "roles" }) });
    const res = await folders.hide("fld_1", { hiddenMode: "roles", targets: ["role_a"] });
    expect(api.calls[0].body).toEqual({ hidden_mode: "roles", targets: ["role_a"] });
    expect(res).toEqual({ hiddenMode: "roles" });
  });

  it("hide omits targets for everyone/none", async () => {
    const { api, folders } = setup({ "POST /api/folders/fld_1/hide": ok({ hidden_mode: "everyone" }) });
    await folders.hide("fld_1", { hiddenMode: "everyone" });
    expect(api.calls[0].body).toEqual({ hidden_mode: "everyone" });
  });
});

describe("folders share links", () => {
  it("getShareLinks GETs the folder share route", async () => {
    const { api, folders } = setup({ "GET /api/folders/fld_1/share": ok({ links: [], excluded_count: 1 }) });
    const res = await folders.getShareLinks("fld_1");
    expect(api.calls[0].path).toBe("/api/folders/fld_1/share");
    expect(res).toEqual({ links: [], excludedCount: 1 });
  });

  it("createShareLink POSTs to the folder route", async () => {
    const { api, folders } = setup({
      "POST /api/folders/fld_1/share": ok({ link: { id: "l", token: "t", url: "u", lock_mode: "none", access_mode: "public", expires_at: null, created_at: 1 } }, 201),
    });
    const res = await folders.createShareLink("fld_1", { expiresInDays: 7 });
    expect(api.calls[0].body).toEqual({ expires_in_days: 7 });
    expect(res.link.accessMode).toBe("public");
  });

  it("shareByEmail POSTs to share-email", async () => {
    const { api, folders } = setup({
      "POST /api/folders/fld_1/share-email": ok({ share_url: "u", access_mode: "public", sent: 1, failed: [] }, 201),
    });
    const res = await folders.shareByEmail("fld_1", { emails: ["a@b.c"] });
    expect(api.calls[0].body).toEqual({ emails: ["a@b.c"] });
    expect(res).toEqual({ shareUrl: "u", accessMode: "public", sent: 1, failed: [] });
  });
});
