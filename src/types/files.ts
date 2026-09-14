import type { HiddenMode, LockMode, PaginationMeta } from "./common.js";

/** Columns the listing sorts on (`GET /api/files`, lib/list-sort.ts). */
export type FileSortColumn =
  | "name"
  | "size"
  | "created"
  | "modified"
  | "taken"
  | "type"
  | "extension"
  | "version"
  | "uploader"
  | "region"
  | "origin"
  | "shares"
  | "comments";

/**
 * A legacy mode, `<column>_asc|_desc`, or a bare column (direction from `dir`).
 * Unknown values fall back to `newest` rather than erroring.
 */
export type FileSort =
  | "newest"
  | "oldest"
  | "largest"
  | "smallest"
  | `${FileSortColumn}_${"asc" | "desc"}`
  | FileSortColumn;

export interface ListFilesParams {
  workspaceId: string;
  /** Omit or `null` for the workspace root (a folder-confined member gets their folder). */
  folderId?: string | null;
  filter?: "all" | "documents" | "videos" | "images";
  sort?: FileSort;
  /** Direction for a bare column in `sort`. Ignored for legacy and suffixed values. */
  dir?: "asc" | "desc";
  q?: string;
  /** List the trash instead of live items. */
  deleted?: boolean;
  /** Show only hidden items. Needs the `hide_files` permission, otherwise ignored. */
  hidden?: boolean;
  /** Folder unlock token (from `folders.unlock`); required to list a `full_lock` folder. */
  unlockToken?: string;
  /** List a folder group instead of a folder. */
  groupId?: string;
  /** With `deleted: true`, browse inside this trashed folder. */
  folder?: string;
  /** 1-based. */
  page?: number;
  /** Clamped to 10-500. Default 100. */
  perPage?: number;
}

export interface FileListItem {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  extension: string | null;
  region: string;
  uploadedBy: string;
  /** Source file creation time when known, else upload time (unix seconds). */
  createdAt: number;
  /** Source file modification time when known, else last change (unix seconds). */
  updatedAt: number;
  deletedAt: number | null;
  lockMode: LockMode;
  isHidden: number;
  hiddenMode: HiddenMode;
  currentVersion: number;
  isSynced: number;
  importSource: string | null;
  importAccountEmail: string | null;
  origin: string | null;
  contentHash: string | null;
  etag: string | null;
  /** EXIF capture date as a zone-less wall-clock string. */
  capturedAt: string | null;
  uploaderName: string | null;
  shareCount: number;
  commentCount: number;
}

export interface FolderListItem {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Trash view only. */
  deletedAt?: number | null;
  lockMode: LockMode;
  isHidden: number;
  hiddenMode: HiddenMode;
  isSynced: number;
  origin: string | null;
  /** Direct children: files plus subfolders (trash view: trashed files). */
  fileCount: number;
  /** Display name of the folder's creator. */
  uploaderName: string | null;
  shareCount: number;
  commentCount: number;
  /** Recursive size of live contents (trash view: bytes trashed with the folder). */
  totalSizeBytes: number;
  /** Latest change anywhere inside the folder. */
  contentUpdatedAt: number;
  /** Region of the contents: one region code, `"multi"` when mixed, `null` when empty or in the trash. */
  region: string | null;
  /** Trash view only: true for rows the user deleted directly. */
  isTrashRoot?: boolean;
  /** Top-level trash view only. */
  trashedSizeBytes?: number;
}

export interface Breadcrumb {
  id: string;
  name: string;
}

export interface ListFilesResponse {
  folders: FolderListItem[];
  files: FileListItem[];
  /** Root to current folder. */
  breadcrumbs: Breadcrumb[];
  workspaceId: string;
  folderId: string | null;
  canLock: boolean;
  canHide: boolean;
  /** The listed folder is `view_only`: downloads are refused. */
  folderViewOnly: boolean;
  pagination: PaginationMeta;
}

export interface FileDetail {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  extension: string | null;
  region: string;
  uploadedBy: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  lockMode: LockMode;
  isHidden: number;
  hiddenMode: HiddenMode;
  currentVersion: number;
  workspaceId: string;
  folderId: string | null;
  contentHash: string | null;
  etag: string | null;
  uploaderName: string | null;
  shareCount: number;
  commentCount: number;
}

export interface FileVersion {
  /** A never-edited file reports its current version as `fver_implicit_<fileId>`, which is not a real version row. */
  id: string;
  versionNumber: number;
  sizeBytes: number;
  mimeType: string;
  extension: string | null;
  uploadedBy: string;
  createdAt: number;
  uploaderName: string | null;
}

export interface FileVersionList {
  fileName: string;
  fileSize: number;
  fileMime: string;
  fileCreated: number;
  currentVersion: number;
  /** Newest first. Always includes the current version. */
  versions: FileVersion[];
}

export interface BatchDeleteParams {
  workspaceId: string;
  /** Up to 500. */
  fileIds?: string[];
  folderIds?: string[];
}

export interface BatchDeleteResult {
  /** Files actually moved to the trash. */
  deleted: number;
  foldersDeleted: number;
}

export interface DuplicateFile {
  id: string;
  name: string;
  folderId: string | null;
  createdAt: number;
  uploadedBy: string;
  uploaderName: string | null;
  mimeType: string;
  extension: string | null;
  contentHash: string;
  sizeBytes: number;
  /** Folder path such as `"Projects / 2026"`; `null` at the root. */
  folderPath: string | null;
}

export interface DuplicateGroup {
  contentHash: string;
  sizeBytes: number;
  count: number;
  /** `(count - 1) * sizeBytes`. */
  wastedBytes: number;
  /** Newest first. */
  files: DuplicateFile[];
}

export interface DuplicatesResponse {
  /** `false` when the workspace has duplicate scanning turned off; the rest is then empty. */
  scanEnabled: boolean;
  /** Up to 100 groups, most wasted bytes first. */
  groups: DuplicateGroup[];
  /** Over every group, not just the returned page. */
  totalGroups: number;
  totalWastedBytes: number;
  /** Files still waiting to be hashed. */
  scanning: { pending: number };
}
