import type { HttpClient } from "../http.js";
import type { SearchParams, SearchResponse } from "../types.js";

export class SearchResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Search files, folders, share links and file requests by name. Add `ext:pdf`
   * at the start or end of `q` to filter files by extension. Result sets the key's
   * member cannot see (no `access_files`, no share permission) come back empty rather than 403.
   */
  async query(params: SearchParams): Promise<SearchResponse> {
    return this.http.request({
      method: "GET",
      path: "/api/search",
      query: {
        workspaceId: params.workspaceId,
        q: params.q,
        page: params.page,
        perPage: params.perPage,
      },
    });
  }
}
