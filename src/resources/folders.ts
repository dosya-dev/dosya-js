import type { HttpClient } from "../http.js";
import type {
  CreateFolderParams,
  FolderDetail,
  FolderTreeItem,
  SetLockParams,
} from "../types.js";

export class FoldersResource {
  constructor(private readonly http: HttpClient) {}

  async create(params: CreateFolderParams): Promise<{
    folder: FolderDetail;
    createdCount: number;
    createdFolders: FolderDetail[];
  }> {
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

  async get(folderId: string): Promise<{ folder: FolderDetail }> {
    return this.http.request({
      method: "GET",
      path: `/api/folders/${folderId}`,
    });
  }

  async rename(folderId: string, name: string): Promise<{ name: string }> {
    return this.http.request({
      method: "PUT",
      path: `/api/folders/${folderId}`,
      body: { name },
    });
  }

  async delete(folderId: string): Promise<{
    filesAffected: number;
    foldersRemoved: number;
  }> {
    return this.http.request({
      method: "DELETE",
      path: `/api/folders/${folderId}`,
    });
  }

  async move(folderId: string, parentId: string | null): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: `/api/folders/${folderId}/move`,
      body: { parentId },
    });
  }

  async tree(workspaceId: string): Promise<{ folders: FolderTreeItem[] }> {
    return this.http.request({
      method: "GET",
      path: "/api/folders/tree",
      query: { workspace_id: workspaceId },
    });
  }

  async lock(folderId: string, params: SetLockParams): Promise<void> {
    await this.http.request({
      method: "POST",
      path: `/api/folders/${folderId}/lock`,
      body: { lockMode: params.lockMode, password: params.password },
    });
  }

  async unlock(folderId: string): Promise<void> {
    await this.http.request({
      method: "POST",
      path: `/api/folders/${folderId}/unlock`,
    });
  }
}
