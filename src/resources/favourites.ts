import type { HttpClient } from "../http.js";
import type { FavouriteTarget, FavouritesList } from "../types/favourites.js";

/** The caller's own starred folders and files, per workspace. */
export class FavouritesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List the caller's favourite folders and files in a workspace.
   * Folder-confined members are refused (403).
   */
  async list(workspaceId: string): Promise<FavouritesList> {
    return this.http.request({
      method: "GET",
      path: "/api/favourites",
      query: { workspace_id: workspaceId },
    });
  }

  /** Star a folder or a file. 409 when it is already a favourite; 404 when it is missing or trashed. */
  async add(params: FavouriteTarget): Promise<{ id: string }> {
    return this.http.request({
      method: "POST",
      path: "/api/favourites",
      body: {
        workspaceId: params.workspaceId,
        folderId: params.folderId,
        fileId: params.fileId,
      },
    });
  }

  /** Unstar a folder or a file. Succeeds even when it was not a favourite. */
  async remove(params: FavouriteTarget): Promise<void> {
    await this.http.request({
      method: "DELETE",
      path: "/api/favourites",
      query: {
        workspace_id: params.workspaceId,
        folder_id: params.folderId,
        file_id: params.fileId,
      },
    });
  }
}
