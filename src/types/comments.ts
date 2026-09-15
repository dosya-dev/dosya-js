/** Which item's comments to list: exactly one of `fileId` / `folderId`. */
export type ListCommentsParams =
  | { workspaceId: string; fileId: string; folderId?: undefined }
  | { workspaceId: string; folderId: string; fileId?: undefined };

/** Comment on a file or a folder: exactly one of `fileId` / `folderId`. */
export type CreateCommentParams = {
  workspaceId: string;
  /** Reply to this comment. */
  parentId?: string;
  /** 1-5000 characters. */
  body: string;
} & ({ fileId: string; folderId?: undefined } | { folderId: string; fileId?: undefined });

export interface CommentDetail {
  id: string;
  fileId: string | null;
  folderId: string | null;
  workspaceId: string;
  userId: string;
  /** Null for a top-level comment. */
  parentId: string | null;
  body: string;
  isEdited: number | boolean;
  createdAt: number;
  updatedAt: number;
  userName: string | null;
  userEmail: string | null;
  userAvatar: string | null;
}
