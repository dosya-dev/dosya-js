import { seg, type HttpClient } from "../http.js";
import type {
  ListFilesParams,
  ListFilesResponse,
  FileDetail,
  FileVersionList,
  BatchDeleteParams,
  BatchDeleteResult,
  DuplicatesResponse,
} from "../types/files.js";
import type {
  CreateShareBundleParams,
  CreateShareLinkParams,
  CreatedShareBundle,
  CreatedShareLink,
  ItemShareLink,
  ShareByEmailParams,
  ShareByEmailResult,
} from "../types/shares.js";
import type { HideInfo, HiddenMode, LockInfo, LockMode, SetHideParams, SetLockParams, UnlockGrant } from "../types/common.js";
import { createItemShareLink, listItemShareLinks, shareItemByEmail } from "./_share-links.js";

export class FilesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List folders and files in a workspace folder, the trash (`deleted`), hidden
   * items (`hidden`) or a folder group (`groupId`).
   *
   * A `full_lock` folder answers 403 `folder_locked` unless `unlockToken` is valid.
   */
  async list(params: ListFilesParams): Promise<ListFilesResponse> {
    return this.http.request({
      method: "GET",
      path: "/api/files",
      query: {
        workspace_id: params.workspaceId,
        folder_id: params.folderId,
        filter: params.filter,
        sort: params.sort,
        dir: params.dir,
        q: params.q,
        // The handler checks `=== "1"`; `true` would silently list live items.
        deleted: params.deleted ? 1 : undefined,
        hidden: params.hidden ? 1 : undefined,
        ut: params.unlockToken,
        group_id: params.groupId,
        folder: params.deleted ? params.folder : undefined,
        page: params.page,
        per_page: params.perPage,
      },
    });
  }

  /** Get one file's metadata. Hidden files answer 404; files in a locked folder 403 `folder_locked`. */
  async get(fileId: string): Promise<{ file: FileDetail }> {
    return this.http.request({
      method: "GET",
      path: `/api/files/${seg(fileId)}`,
    });
  }

  /**
   * Delete a file in two stages: the first call moves a live file to the trash
   * (`permanent: false`), a call on a file already in the trash purges it and
   * all its versions for good (`permanent: true`). Locked files cannot be deleted.
   *
   * Never retried automatically, so a replay cannot turn a trash into a purge.
   */
  async delete(fileId: string): Promise<{ permanent: boolean }> {
    return this.http.request({
      method: "DELETE",
      path: `/api/files/${seg(fileId)}`,
      retry: "never",
    });
  }

  /** Restore a file from the trash. 409 when its folder is still in the trash (restore the folder first). */
  async restore(fileId: string): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: `/api/files/${seg(fileId)}`,
      retry: "never",
    });
  }

  /** Rename a file. Needs the `rename_files` permission; locked files cannot be renamed. */
  async rename(fileId: string, name: string): Promise<{ name: string }> {
    return this.http.request({
      method: "PUT",
      path: `/api/files/${seg(fileId)}/rename`,
      body: { name },
    });
  }

  /**
   * Move a file to a folder (`null` = workspace root), optionally renaming it in
   * the same step (`options.name`, also needs `rename_files`).
   *
   * 409 when the target already has a file with that name; 400 when the file is already there.
   */
  async move(fileId: string, folderId: string | null, options: { name?: string } = {}): Promise<{ name: string }> {
    return this.http.request({
      method: "PUT",
      path: `/api/files/${seg(fileId)}/move`,
      body: { folderId, name: options.name },
      retry: "never",
    });
  }

  /**
   * Copy a file into a folder. The copy is named `"Copy of <name>"` when it
   * lands in the source file's own folder, otherwise it keeps the name.
   *
   * Omitting `folderId` copies to the workspace ROOT, not next to the source.
   * Needs the `upload_files` permission and counts against storage.
   */
  async copy(fileId: string, options: { folderId?: string | null } = {}): Promise<{ fileId: string; name: string }> {
    return this.http.request({
      method: "POST",
      path: `/api/files/${seg(fileId)}/copy`,
      body: { folderId: options.folderId ?? null },
    });
  }

  /** Read a file's lock state. */
  async getLock(fileId: string): Promise<LockInfo> {
    return this.http.request({
      method: "GET",
      path: `/api/files/${seg(fileId)}/lock`,
    });
  }

  /**
   * Set or remove a file lock. `lockMode: "none"` removes it; `full_lock` needs a
   * password of at least 4 characters. Needs the `lock_files` permission.
   */
  async lock(fileId: string, params: SetLockParams): Promise<{ lockMode: LockMode }> {
    return this.http.request({
      method: "POST",
      path: `/api/files/${seg(fileId)}/lock`,
      body: { lockMode: params.lockMode, password: params.password },
    });
  }

  /**
   * Exchange the password of a `full_lock` file for a one-hour unlock token, to
   * pass as `unlockToken` to download, raw and thumbnail calls.
   *
   * This does NOT remove the lock - use `lock(fileId, { lockMode: "none" })` for that.
   * 401 on a wrong password; 400 when the file is not password-locked.
   */
  async unlock(fileId: string, password: string): Promise<UnlockGrant> {
    return this.http.request({
      method: "POST",
      path: `/api/files/${seg(fileId)}/unlock`,
      body: { password },
    });
  }

  /** Read a file's hidden mode and its user/role rules. */
  async getHide(fileId: string): Promise<HideInfo> {
    return this.http.request({
      method: "GET",
      path: `/api/files/${seg(fileId)}/hide`,
    });
  }

  /**
   * Hide a file from everyone, from specific users or roles (`targets`), or
   * un-hide it (`hiddenMode: "none"`). Replaces any previous rules.
   * Needs the `hide_files` permission.
   */
  async hide(fileId: string, params: SetHideParams): Promise<{ hiddenMode: HiddenMode }> {
    return this.http.request({
      method: "POST",
      path: `/api/files/${seg(fileId)}/hide`,
      body: {
        hiddenMode: params.hiddenMode,
        targets: "targets" in params ? params.targets : undefined,
      },
    });
  }

  /**
   * List a file's versions, newest first. A never-edited file still reports its
   * current version, with the synthetic id `fver_implicit_<fileId>`.
   */
  async listVersions(fileId: string): Promise<FileVersionList> {
    return this.http.request({
      method: "GET",
      path: `/api/files/${seg(fileId)}/versions`,
    });
  }

  /**
   * Make an older version current again by copying it forward as a new version.
   * Refused on locked files; needs the `upload_files` permission.
   */
  async restoreVersion(
    fileId: string,
    versionNumber: number,
  ): Promise<{ version: number; restoredFrom: number }> {
    return this.http.request({
      method: "POST",
      path: `/api/files/${seg(fileId)}/versions/restore`,
      body: { versionNumber },
    });
  }

  /** List a file's live (non-revoked) share links. Roles limited to their own shares see only theirs. */
  async getShareLinks(fileId: string): Promise<{ links: ItemShareLink[] }> {
    return listItemShareLinks(this.http, "files", fileId);
  }

  /**
   * Create a public or recipient-restricted share link for a file.
   * Share passwords need at least 8 characters; workspace settings may force a
   * password, cap the expiry or disable links (403).
   */
  async createShareLink(fileId: string, params?: CreateShareLinkParams): Promise<{ link: CreatedShareLink }> {
    return createItemShareLink(this.http, "files", fileId, params);
  }

  /**
   * Create a link and email it. Check `failed` for addresses that could not be
   * mailed. Never retried automatically: a failure can arrive after the link was
   * created and mailed.
   */
  async shareByEmail(fileId: string, params: ShareByEmailParams): Promise<ShareByEmailResult> {
    return shareItemByEmail(this.http, "files", fileId, params);
  }

  /**
   * Create one share link covering 1-100 files from the same workspace.
   * With `notify`, the link is emailed to `recipientEmails`.
   */
  async createShareBundle(params: CreateShareBundleParams): Promise<CreatedShareBundle> {
    return this.http.request({
      method: "POST",
      path: "/api/files/share-bundle",
      body: {
        fileIds: params.fileIds,
        expiresInDays: params.expiresInDays,
        expiresAt: params.expiresAt,
        password: params.password,
        accessMode: params.accessMode,
        recipientEmails: params.recipientEmails,
        notify: params.notify,
        message: params.message,
      },
    });
  }

  /**
   * Move up to 500 files and any number of folders to the trash in one call
   * (never purges). Items the caller may not delete, hidden items and locked
   * folders are skipped silently; a locked FILE refuses the whole batch (403).
   */
  async batchDelete(params: BatchDeleteParams): Promise<BatchDeleteResult> {
    return this.http.request({
      method: "POST",
      path: "/api/files/batch-delete",
      body: {
        workspaceId: params.workspaceId,
        fileIds: params.fileIds,
        folderIds: params.folderIds,
      },
    });
  }

  /** Groups of identical files (same content hash) in a workspace, most wasted space first. */
  async duplicates(workspaceId: string): Promise<DuplicatesResponse> {
    return this.http.request({
      method: "GET",
      path: "/api/duplicates",
      query: { workspace_id: workspaceId },
    });
  }
}
