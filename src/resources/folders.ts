import { seg, type HttpClient } from "../http.js";
import { DosyaError } from "../errors.js";
import {
  createItemShareLink,
  listItemShareLinks,
  shareItemByEmail,
} from "./_share-links.js";
import type {
  BatchFolderInput,
  BatchFolderResult,
  CreateFolderParams,
  CreateFolderResult,
  CreateShareLinkParams,
  CreatedShareLink,
  DeleteFolderOptions,
  DeleteFolderResult,
  FolderChild,
  FolderDetail,
  FolderSearchResult,
  FolderTreeItem,
  HideInfo,
  HiddenMode,
  ItemShareLink,
  LockInfo,
  LockMode,
  PurgeFolderOptions,
  PurgeFolderSummary,
  RestoreFolderResult,
  SetHideParams,
  SetLockParams,
  ShareByEmailParams,
  ShareByEmailResult,
  UnlockGrant,
} from "../types.js";

export class FoldersResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a folder, or a nested path like `"a/b/c"`, find-or-create style:
   * existing segments are reused and `createdCount` is 0 when nothing was new.
   * Works with an upload-scoped key. 403 `folder_locked` when the parent is full-locked;
   * 404 for a missing or hidden parent.
   */
  async create(params: CreateFolderParams): Promise<CreateFolderResult> {
    return this.http.request({
      method: "POST",
      path: "/api/folders",
      body: {
        workspaceId: params.workspaceId,
        parentId: params.parentId,
        name: params.name,
      },
    });
  }

  /**
   * Create up to 500 single-segment folders in one call (find-or-create).
   * Needs a full-scope key. Entries with an invalid name, or a parent that is missing,
   * hidden or outside the caller's reach, are silently left out of the result -
   * compare lengths if that matters.
   */
  async createBatch(workspaceId: string, folders: BatchFolderInput[]): Promise<{ folders: BatchFolderResult[] }> {
    return this.http.request({
      method: "POST",
      path: "/api/folders/batch",
      body: {
        workspaceId,
        folders: folders.map((f) => ({ name: f.name, parentId: f.parentId ?? null })),
      },
    });
  }

  /** Folder metadata. Also answers for a folder in the trash (`isDeleted` 1). */
  async get(folderId: string): Promise<{ folder: FolderDetail }> {
    return this.http.request({
      method: "GET",
      path: `/api/folders/${seg(folderId)}`,
    });
  }

  /** Rename a live folder. Needs the `rename_folders` permission. */
  async rename(folderId: string, name: string): Promise<{ name: string }> {
    return this.http.request({
      method: "PUT",
      path: `/api/folders/${seg(folderId)}/rename`,
      body: { name },
    });
  }

  /**
   * Restore a trashed root folder and everything deleted with it. Lands at the
   * workspace root when the original parent is gone, and is renamed on a name
   * collision. 400 when the folder is not in the trash or was deleted as part of another folder.
   */
  async restore(folderId: string): Promise<RestoreFolderResult> {
    return this.http.request({
      method: "PUT",
      path: `/api/folders/${seg(folderId)}`,
      retry: "never",
    });
  }

  /**
   * Delete a folder. Two-stage:
   * - on a live folder, moves the subtree to the trash (`permanent: false`);
   * - on a folder ALREADY in the trash, PERMANENTLY purges it (`permanent: true`).
   *   A purge pass can stop early (`complete: false`, HTTP 202); call again to finish.
   *
   * A second call on the same folder therefore destroys data, so this is never
   * retried automatically. Prefer `purge()` to empty a trashed folder.
   * Any lock (other than `"none"`) blocks deletion with 403.
   */
  async delete(folderId: string, options: DeleteFolderOptions = {}): Promise<DeleteFolderResult> {
    return this.http.request({
      method: "DELETE",
      path: `/api/folders/${seg(folderId)}`,
      query: { maxR2Calls: options.maxR2Calls },
      retry: "never",
    });
  }

  /**
   * Permanently purge a folder that is already in the trash, calling delete
   * until the purge completes. Refuses (without deleting anything) when the
   * folder is not in the trash, so it can never trash a live folder by mistake.
   */
  async purge(folderId: string, options: PurgeFolderOptions = {}): Promise<PurgeFolderSummary> {
    const { folder } = await this.get(folderId);
    if (!folder.isDeleted) {
      throw new DosyaError(`Folder ${folderId} is not in the trash; call delete() first to trash it`);
    }
    const maxPasses = options.maxPasses ?? 100;
    let filesAffected = 0;
    for (let passes = 1; passes <= maxPasses; passes++) {
      options.signal?.throwIfAborted();
      const result = await this.delete(folderId, { maxR2Calls: options.maxR2Calls });
      if (!result.permanent) {
        // Restored and re-trashed by someone else in between: stop, do not purge.
        throw new DosyaError(`Folder ${folderId} was live again and has been moved back to the trash; purge not performed`);
      }
      filesAffected += result.filesAffected;
      if (result.complete) return { filesAffected, passes };
    }
    throw new DosyaError(`Purge of folder ${folderId} did not complete within ${maxPasses} passes`);
  }

  /**
   * Move a folder under `parentId` (`null` for the root). Needs `rename_folders`.
   * A move to the folder's current parent is a 400, not a no-op.
   */
  async move(folderId: string, parentId: string | null): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: `/api/folders/${seg(folderId)}/move`,
      body: { parentId },
      retry: "never",
    });
  }

  /**
   * Every live folder in the workspace as one flat list (no pagination).
   * For large workspaces prefer `children()` and `search()`. Needs `access_files`.
   */
  async tree(workspaceId: string): Promise<{ folders: FolderTreeItem[] }> {
    return this.http.request({
      method: "GET",
      path: "/api/folders/tree",
      query: { workspaceId },
    });
  }

  /** Direct subfolders of `parentId` (omit for the root), each with `hasChildren`. Needs `access_files`. */
  async children(workspaceId: string, parentId?: string | null): Promise<{ folders: FolderChild[] }> {
    return this.http.request({
      method: "GET",
      path: "/api/folders/children",
      query: { workspaceId, parentId },
    });
  }

  /**
   * Up to 50 folders whose name contains `q`, sorted by name, each with its
   * breadcrumb `path`. An empty `q` returns no folders. Needs `access_files`.
   */
  async search(workspaceId: string, q: string): Promise<{ folders: FolderSearchResult[] }> {
    return this.http.request({
      method: "GET",
      path: "/api/folders/search",
      query: { workspaceId, q },
    });
  }

  /** Current lock state. */
  async getLock(folderId: string): Promise<LockInfo> {
    return this.http.request({
      method: "GET",
      path: `/api/folders/${seg(folderId)}/lock`,
    });
  }

  /**
   * Set or remove a lock. `lockMode: "none"` removes it; `"full_lock"` needs a
   * password of at least 4 characters. Needs the `lock_files` permission.
   */
  async lock(folderId: string, params: SetLockParams): Promise<{ lockMode: LockMode }> {
    return this.http.request({
      method: "POST",
      path: `/api/folders/${seg(folderId)}/lock`,
      body: { lockMode: params.lockMode, password: params.password },
    });
  }

  /**
   * Enter the password of a `full_lock` folder to get a one-hour access grant
   * for the calling user. Does not remove the lock (use `lock(id, { lockMode: "none" })`).
   * 400 when the folder is not password-locked, 401 on a wrong password. Needs a full-scope key.
   */
  async unlock(folderId: string, password: string): Promise<UnlockGrant> {
    return this.http.request({
      method: "POST",
      path: `/api/folders/${seg(folderId)}/unlock`,
      body: { password },
    });
  }

  /** Hidden state and its user/role rules. */
  async getHide(folderId: string): Promise<HideInfo> {
    return this.http.request({
      method: "GET",
      path: `/api/folders/${seg(folderId)}/hide`,
    });
  }

  /**
   * Hide a folder from everyone, from listed users or roles, or unhide it
   * (`hiddenMode: "none"`). Needs the `hide_files` permission.
   */
  async hide(folderId: string, params: SetHideParams): Promise<{ hiddenMode: HiddenMode }> {
    return this.http.request({
      method: "POST",
      path: `/api/folders/${seg(folderId)}/hide`,
      body: {
        hiddenMode: params.hiddenMode,
        targets: "targets" in params ? params.targets : undefined,
      },
    });
  }

  /** Live share links on this folder the caller may see. */
  async getShareLinks(folderId: string): Promise<{ links: ItemShareLink[]; excludedCount?: number }> {
    return listItemShareLinks(this.http, "folders", folderId);
  }

  /** Create a share link to this folder. Refused for locked folders and by workspace share policy. */
  async createShareLink(folderId: string, params: CreateShareLinkParams = {}): Promise<{ link: CreatedShareLink }> {
    return createItemShareLink(this.http, "folders", folderId, params);
  }

  /** Email a link to this folder to up to 50 recipients. */
  async shareByEmail(folderId: string, params: ShareByEmailParams): Promise<ShareByEmailResult> {
    return shareItemByEmail(this.http, "folders", folderId, params);
  }
}
