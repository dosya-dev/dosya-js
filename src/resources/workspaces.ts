import type { HttpClient } from "../http.js";
import type {
  CreateWorkspaceParams,
  UpdateWorkspaceParams,
  WorkspaceListItem,
  WorkspaceDetail,
  WorkspaceSettings,
} from "../types.js";

export class WorkspacesResource {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<{ workspaces: WorkspaceListItem[] }> {
    return this.http.request({
      method: "GET",
      path: "/api/workspaces",
    });
  }

  async get(workspaceId: string): Promise<{
    workspace: WorkspaceDetail;
    settings: WorkspaceSettings | null;
    roleId: string;
    isOwner: boolean;
  }> {
    return this.http.request({
      method: "GET",
      path: `/api/workspaces/${workspaceId}`,
    });
  }

  async create(params: CreateWorkspaceParams): Promise<{ workspace: WorkspaceDetail }> {
    return this.http.request({
      method: "POST",
      path: "/api/workspaces",
      body: {
        name: params.name,
        iconInitials: params.iconInitials,
        iconColor: params.iconColor,
        defaultRegion: params.defaultRegion,
      },
    });
  }

  async update(workspaceId: string, params: UpdateWorkspaceParams): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: `/api/workspaces/${workspaceId}`,
      body: {
        name: params.name,
        iconInitials: params.iconInitials,
        iconColor: params.iconColor,
        defaultRegion: params.defaultRegion,
      },
    });
  }

  async updateSettings(
    workspaceId: string,
    settings: Partial<WorkspaceSettings>,
  ): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: `/api/workspaces/${workspaceId}/settings`,
      body: settings as Record<string, unknown>,
    });
  }

  async delete(workspaceId: string): Promise<void> {
    await this.http.request({
      method: "DELETE",
      path: `/api/workspaces/${workspaceId}`,
    });
  }
}
