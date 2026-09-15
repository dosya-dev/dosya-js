import { seg, type HttpClient } from "../http.js";
import type { CreateCommentParams, CommentDetail, ListCommentsParams } from "../types.js";

export class CommentsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Every comment on a file or a folder, flat and oldest first (rebuild threads
   * from `parentId`). No pagination.
   */
  async list(params: ListCommentsParams): Promise<{ comments: CommentDetail[] }> {
    return this.http.request({
      method: "GET",
      path: "/api/comments",
      query: {
        workspaceId: params.workspaceId,
        fileId: params.fileId,
        folderId: params.folderId,
      },
    });
  }

  /**
   * Comment on a file or folder, or reply with `parentId`. Body 1-5000 characters.
   * Needs a full-scope key; keys pinned to a workspace are refused (403).
   */
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

  /** Edit your own comment. Needs a full-scope key; workspace-pinned keys are refused. */
  async edit(commentId: string, body: string): Promise<{ body: string; updatedAt: number }> {
    return this.http.request({
      method: "PUT",
      path: `/api/comments/${seg(commentId)}`,
      body: { body },
    });
  }

  /**
   * Delete a comment. Allowed for its author and for workspace owners/admins.
   * Needs a full-scope key; workspace-pinned keys are refused.
   */
  async delete(commentId: string): Promise<void> {
    await this.http.request({
      method: "DELETE",
      path: `/api/comments/${seg(commentId)}`,
      retry: "never",
    });
  }
}
