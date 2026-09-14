import { describe, it, expect } from "vitest";
import { FavouritesResource } from "../../src/resources/favourites.js";
import { mockApi, ok } from "./_mock.js";

describe("FavouritesResource", () => {
  it("list() GETs with workspace_id and camelCases rows", async () => {
    const api = mockApi({
      "GET /api/favourites": ok({
        folders: [{ id: "fav_1", folder_id: "fo_1", created_at: 1, folder_name: "A", parent_id: null }],
        files: [{ id: "fav_2", file_id: "f_1", created_at: 2, file_name: "a.txt", size_bytes: 3, mime_type: "text/plain", extension: "txt", lock_mode: "none", current_version: 1, folder_id: null }],
      }),
    });
    const res = await new FavouritesResource(api.http()).list("ws_1");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    expect(res.folders[0]).toEqual({ id: "fav_1", folderId: "fo_1", createdAt: 1, folderName: "A", parentId: null });
    expect(res.files[0]).toMatchObject({ fileId: "f_1", fileName: "a.txt", sizeBytes: 3, lockMode: "none", currentVersion: 1 });
  });

  it("add() POSTs workspace_id + file_id and returns the id", async () => {
    const api = mockApi({ "POST /api/favourites": ok({ id: "fav_9" }, 201) });
    const res = await new FavouritesResource(api.http()).add({ workspaceId: "ws_1", fileId: "f_1" });
    expect(res).toEqual({ id: "fav_9" });
    expect(api.calls[0].body).toEqual({ workspace_id: "ws_1", file_id: "f_1" });
  });

  it("add() POSTs a folder", async () => {
    const api = mockApi({ "POST /api/favourites": ok({ id: "fav_9" }, 201) });
    await new FavouritesResource(api.http()).add({ workspaceId: "ws_1", folderId: "fo_1" });
    expect(api.calls[0].body).toEqual({ workspace_id: "ws_1", folder_id: "fo_1" });
  });

  it("remove() DELETEs with the target in the query, not a body", async () => {
    const api = mockApi({ "DELETE /api/favourites": ok() });
    await expect(new FavouritesResource(api.http()).remove({ workspaceId: "ws_1", folderId: "fo_1" })).resolves.toBeUndefined();
    expect(api.calls[0]).toMatchObject({ method: "DELETE", query: { workspace_id: "ws_1", folder_id: "fo_1" } });
    expect(api.calls[0].rawBody ?? undefined).toBeUndefined();
  });
});
