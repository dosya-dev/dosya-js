import { describe, it, expect } from "vitest";
import { SearchResource } from "../../src/resources/search.js";
import type { SearchResponse } from "../../src/types.js";
import { mockApi, ok } from "./_mock.js";

describe("search.query", () => {
  it("sends snake_case query params and returns the real response shape", async () => {
    const api = mockApi({
      "GET /api/search": ok({
        query: "ext:pdf report",
        ext: "pdf",
        files: [{
          id: "f1", name: "report.pdf", size_bytes: 10, mime_type: "application/pdf", extension: "pdf",
          region: "apac", folder_id: null, uploaded_by: "u1", created_at: 1, lock_mode: "none", uploader_name: "U",
        }],
        folders: [],
        shared: [{
          link_id: "sl1", token: "tok", expires_at: null, view_count: 0, download_count: 0, is_revoked: 0,
          shared_at: 5, created_by: "u1", folder_id: null, is_bundle: 0, file_id: "f1", file_name: "report.pdf",
          size_bytes: 10, extension: "pdf", region: "apac", folder_name: null, sharer_name: "U", status: "active",
        }],
        file_requests: [{
          id: "fr1", title: "T", message: null, expires_at: null, upload_count: 2, is_revoked: 0, created_at: 3, created_by_name: null,
        }],
        pagination: {
          page: 2, per_page: 10, total_files: 11, total_folders: 0, total_shares: 1, total_requests: 1, has_more: false,
        },
      }),
    });
    const search = new SearchResource(api.http());
    const res: SearchResponse = await search.query({ workspaceId: "ws_1", q: "ext:pdf report", page: 2, perPage: 10 });

    expect(api.calls[0].method).toBe("GET");
    expect(api.calls[0].path).toBe("/api/search");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1", q: "ext:pdf report", page: "2", per_page: "10" });

    expect(res.ext).toBe("pdf");
    expect(res.files[0]).toMatchObject({ folderId: null, uploadedBy: "u1", uploaderName: "U", lockMode: "none", region: "apac" });
    expect(res.shared[0].linkId).toBe("sl1");
    expect(res.shared[0].sharedAt).toBe(5);
    expect(res.shared[0]).not.toHaveProperty("id");
    expect(res.fileRequests[0]).toMatchObject({ uploadCount: 2, createdByName: null });
    expect(res.fileRequests[0]).not.toHaveProperty("token");
    expect(res.pagination).toEqual({
      page: 2, perPage: 10, totalFiles: 11, totalFolders: 0, totalShares: 1, totalRequests: 1, hasMore: false,
    });
    expect(res.pagination).not.toHaveProperty("totalPages");
  });
});
