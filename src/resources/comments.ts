import type { HttpClient } from "../http.js";
import type { CreateCommentParams, CommentDetail } from "../types.js";

export class CommentsResource {
  constructor(private readonly http: HttpClient) {}

  async list(params: {
    workspaceId: string;
    fileId?: string;
    folderId?: string;
  }): Promise<{ comments: CommentDetail[] }> {
    return this.http.request({
      method: "GET",
      path: "/api/comments",
      query: {
        workspace_id: params.workspaceId,
        file_id: params.fileId,
        folder_id: params.folderId,
      },
    });
  }

  async create(params: CreateCommentParams): Promise<{ comment: CommentDetail }> {
    return this.http.request({
      method: "POST",
      path: "/api/comments",
      body: {
        workspaceId: params.workspaceId,
        fileId: params.fileId,
        folderId: params.folderId,
        parentId: params.parentId,
        body: params.body,
      },
    });
  }

  async edit(commentId: string, body: string): Promise<{ body: string; updatedAt: number }> {
    return this.http.request({
      method: "PUT",
      path: `/api/comments/${commentId}`,
      body: { body },
    });
  }

  async delete(commentId: string): Promise<void> {
    await this.http.request({
      method: "DELETE",
      path: `/api/comments/${commentId}`,
    });
  }
}
