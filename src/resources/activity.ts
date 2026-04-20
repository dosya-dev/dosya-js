import type { HttpClient } from "../http.js";
import type { ListActivityParams, ActivityListResponse } from "../types.js";

export class ActivityResource {
  constructor(private readonly http: HttpClient) {}

  async list(params: ListActivityParams): Promise<ActivityListResponse> {
    return this.http.request({
      method: "GET",
      path: "/api/activity",
      query: {
        workspace_id: params.workspaceId,
        page: params.page,
        per_page: params.perPage,
        category: params.category,
        action: params.action,
        user_id: params.userId,
      },
    });
  }
}
