import type { HttpClient } from "../http.js";
import type { ListActivityParams, ActivityListResponse } from "../types.js";

function list(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(",") : value;
}

export class ActivityResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * One page of the workspace activity log, newest first. `category`, `action`
   * and `userId` accept a value or a list. Needs the `view_activity` permission;
   * folder-confined members are refused.
   */
  async list(params: ListActivityParams): Promise<ActivityListResponse> {
    return this.http.request({
      method: "GET",
      path: "/api/activity",
      query: {
        workspaceId: params.workspaceId,
        page: params.page,
        perPage: params.perPage,
        category: list(params.category),
        action: list(params.action),
        userId: list(params.userId),
      },
    });
  }
}
