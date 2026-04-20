import type { HttpClient } from "../http.js";
import type { SharesListResponse } from "../types.js";

export class SharesResource {
  constructor(private readonly http: HttpClient) {}

  async list(workspaceId: string): Promise<SharesListResponse> {
    return this.http.request({
      method: "GET",
      path: "/api/shares",
      query: { workspace_id: workspaceId },
    });
  }

  async revoke(linkId: string): Promise<void> {
    await this.http.request({
      method: "POST",
      path: `/api/shares/${linkId}/revoke`,
    });
  }
}
