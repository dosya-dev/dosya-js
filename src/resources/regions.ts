import type { HttpClient } from "../http.js";
import type { RegionsListResponse } from "../types/regions.js";

/** Storage locations a workspace can be created in. */
export class RegionsResource {
  constructor(private readonly http: HttpClient) {}

  /** Every location code plus the one suggested for the caller. `read` or `full` key. */
  async list(): Promise<RegionsListResponse> {
    return this.http.request({ method: "GET", path: "/api/regions" });
  }
}
