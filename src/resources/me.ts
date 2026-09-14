import type { HttpClient } from "../http.js";
import type { UserProfile, MyWorkspacePermissions } from "../types/me.js";

export class MeResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get the account that owns this API key. Needs a `read` or `full` key.
   * Note `user.avatarUrl` is a storage key, not a URL.
   */
  async profile(): Promise<{ user: UserProfile }> {
    return this.http.request({
      method: "GET",
      path: "/api/me",
    });
  }

  /**
   * The caller's role and effective permissions in one workspace. Read scope.
   * Throws 403 `Not a member` when the caller is not in the workspace, and 403
   * for a key pinned to a different workspace.
   * `permissions` keys are the API's snake_case names (e.g. `upload_files`).
   */
  async permissions(workspaceId: string): Promise<MyWorkspacePermissions> {
    return this.http.request({
      method: "GET",
      path: "/api/me/permissions",
      query: { workspace_id: workspaceId },
    });
  }

  /**
   * Change the account's display name (trimmed, 1-80 characters; 400 otherwise).
   * Requires a `full` scope key. Resolves to the stored name.
   */
  async updateName(name: string): Promise<{ name: string }> {
    return this.http.request({
      method: "PUT",
      path: "/api/me/name",
      body: { name },
    });
  }

  /**
   * Permanently revoke the API key this client authenticates with. Works at any
   * key scope. The client is unusable afterwards: every later call fails with 401.
   * Not retried, because a replay after success would itself 401.
   */
  async revokeCurrentKey(): Promise<void> {
    await this.http.request({
      method: "DELETE",
      path: "/api/me/api-keys/current",
      retry: "never",
    });
  }
}
