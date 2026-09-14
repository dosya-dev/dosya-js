import { seg, type HttpClient } from "../http.js";
import type { CreateRoleParams, RoleFields, RolesListResponse, UpdateRoleParams } from "../types/roles.js";

function roleBody(params: RoleFields): Record<string, unknown> {
  return {
    name: params.name,
    permissions: params.permissions,
    allowedIps: params.allowedIps,
    activeHours: params.activeHours,
    requestsPerMinute: params.requestsPerMinute,
    egressBytesPerDay: params.egressBytesPerDay,
    maxFileSizeBytes: params.maxFileSizeBytes,
    maxConcurrentTransfers: params.maxConcurrentTransfers,
  };
}

/**
 * Workspace roles and their permissions.
 *
 * Key scope: GET needs `read` or `full`, the rest `full`; `upload` keys cannot
 * call these. Workspace-pinned keys can only call `list()` (for their own
 * workspace).
 */
export class RolesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Built-in and custom roles with their permission maps, conditions and usage
   * limits. Any member. Use the ids with `team.invite()` / `team.updateMember()`.
   */
  async list(workspaceId: string): Promise<RolesListResponse> {
    return this.http.request({ method: "GET", path: "/api/roles", query: { workspaceId } });
  }

  /** Create a custom role. Needs `manage_roles`. 400 on invalid conditions or limits. */
  async create(params: CreateRoleParams): Promise<{ roleId: string }> {
    return this.http.request({
      method: "POST",
      path: "/api/roles",
      body: { workspaceId: params.workspaceId, ...roleBody(params) },
    });
  }

  /**
   * Update a custom role; only the fields given change, permissions are merged
   * per key. Needs `manage_roles`. Built-in roles are refused (400).
   */
  async update(roleId: string, params: UpdateRoleParams): Promise<void> {
    await this.http.request({ method: "PUT", path: `/api/roles/${seg(roleId)}`, body: roleBody(params) });
  }

  /**
   * Delete a custom role. Needs `manage_roles`. 400 for built-in roles or while
   * members still hold the role.
   */
  async delete(roleId: string): Promise<void> {
    await this.http.request({ method: "DELETE", path: `/api/roles/${seg(roleId)}`, retry: "never" });
  }
}
