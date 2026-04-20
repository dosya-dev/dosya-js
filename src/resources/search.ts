import type { HttpClient } from "../http.js";
import type { SearchParams, SearchResponse } from "../types.js";

export class SearchResource {
  constructor(private readonly http: HttpClient) {}

  async query(params: SearchParams): Promise<SearchResponse> {
    return this.http.request({
      method: "GET",
      path: "/api/search",
      query: {
        workspace_id: params.workspaceId,
        q: params.q,
        page: params.page,
        per_page: params.perPage,
      },
    });
  }
}
