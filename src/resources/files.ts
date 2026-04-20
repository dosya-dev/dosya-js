import type { HttpClient } from "../http.js";
import type {
  ListFilesParams,
  ListFilesResponse,
  FileDetail,
  FileVersion,
  CreateShareLinkParams,
  ShareLinkDetail,
  ShareEmailParams,
  CreateShareBundleParams,
  SetLockParams,
  SetHideParams,
  LockInfo,
} from "../types.js";

export class FilesResource {
  constructor(private readonly http: HttpClient) {}

  async list(params: ListFilesParams): Promise<ListFilesResponse> {
    return this.http.request({
      method: "GET",
      path: "/api/files",
      query: {
        workspace_id: params.workspaceId,
        folder_id: params.folderId,
        filter: params.filter,
        sort: params.sort,
        q: params.q,
        deleted: params.deleted,
        hidden: params.hidden,
        page: params.page,
        per_page: params.perPage,
      },
    });
  }

  async get(fileId: string): Promise<{ file: FileDetail }> {
    return this.http.request({
      method: "GET",
      path: `/api/files/${fileId}`,
    });
  }

  async delete(fileId: string): Promise<{ permanent: boolean }> {
    return this.http.request({
      method: "DELETE",
      path: `/api/files/${fileId}`,
    });
  }

  async restore(fileId: string): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: `/api/files/${fileId}`,
    });
  }

  async rename(fileId: string, name: string): Promise<{ name: string }> {
    return this.http.request({
      method: "PUT",
      path: `/api/files/${fileId}/rename`,
      body: { name },
    });
  }

  async move(fileId: string, folderId: string | null): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: `/api/files/${fileId}/move`,
      body: { folderId },
    });
  }

  async copy(
    fileId: string,
    options?: { newName?: string; folderId?: string | null },
  ): Promise<{ file: FileDetail }> {
    return this.http.request({
      method: "POST",
      path: `/api/files/${fileId}/copy`,
      body: {
        newName: options?.newName,
        folderId: options?.folderId,
      },
    });
  }

  async lock(fileId: string, params: SetLockParams): Promise<void> {
    await this.http.request({
      method: "POST",
      path: `/api/files/${fileId}/lock`,
      body: { lockMode: params.lockMode, password: params.password },
    });
  }

  async unlock(fileId: string): Promise<void> {
    await this.http.request({
      method: "POST",
      path: `/api/files/${fileId}/unlock`,
    });
  }

  async hide(fileId: string, params?: SetHideParams): Promise<void> {
    await this.http.request({
      method: "POST",
      path: `/api/files/${fileId}/hide`,
      body: {
        hiddenMode: params?.hiddenMode,
        targetIds: params?.targetIds,
      },
    });
  }

  async listVersions(fileId: string): Promise<{
    fileName: string;
    currentVersion: number;
    versions: FileVersion[];
  }> {
    return this.http.request({
      method: "GET",
      path: `/api/files/${fileId}/versions`,
    });
  }

  async restoreVersion(
    fileId: string,
    versionNumber: number,
  ): Promise<{ version: number; restoredFrom: number }> {
    return this.http.request({
      method: "POST",
      path: `/api/files/${fileId}/versions/restore`,
      body: { versionNumber },
    });
  }

  async getShareLinks(fileId: string): Promise<{ links: ShareLinkDetail[] }> {
    return this.http.request({
      method: "GET",
      path: `/api/files/${fileId}/share`,
    });
  }

  async createShareLink(
    fileId: string,
    params?: CreateShareLinkParams,
  ): Promise<{ link: ShareLinkDetail }> {
    return this.http.request({
      method: "POST",
      path: `/api/files/${fileId}/share`,
      body: {
        expiresInDays: params?.expiresInDays,
        password: params?.password,
        lockMode: params?.lockMode,
      },
    });
  }

  async shareByEmail(fileId: string, params: ShareEmailParams): Promise<void> {
    await this.http.request({
      method: "POST",
      path: `/api/files/${fileId}/share-email`,
      body: { emails: params.emails, message: params.message },
    });
  }

  async createShareBundle(params: CreateShareBundleParams): Promise<{
    link: {
      id: string;
      token: string;
      url: string;
      fileCount: number;
      expiresAt: number | null;
      createdAt: number;
    };
  }> {
    return this.http.request({
      method: "POST",
      path: "/api/files/share-bundle",
      body: {
        fileIds: params.fileIds,
        expiresInDays: params.expiresInDays,
        password: params.password,
      },
    });
  }
}
