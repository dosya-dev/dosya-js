export interface CreateFolderParams {
  workspaceId: string;
  /** Omit or `null` for the workspace root (a folder-confined member lands in their folder). */
  parentId?: string | null;
  /**
   * Folder name, or a path such as `"a/b/c"` (`/` or `\` separated) to create
   * nested folders in one call. Find-or-create: segments that already exist are
   * reused, so repeating the call is safe.
   */
  name: string;
}

/** The leaf folder `create()` resolved to (created now or already there). */
export interface CreatedFolder {
  id: string;
  name: string;
  parentId: string | null;
  workspaceId: string;
}

export interface CreateFolderResult {
  folder: CreatedFolder;
  /** Folders actually inserted by this call; `0` when every segment already existed. */
  createdCount: number;
  /** The inserted folders, outermost first. */
  createdFolders: Array<{ id: string; name: string; parentId: string | null }>;
}

export interface FolderDetail {
  id: string;
  /** The real name, also for a folder sitting in the trash. */
  name: string;
  workspaceId: string;
  parentId: string | null;
  /** Desktop sync flag (0/1). */
  isSynced: number | boolean;
  /** 1 when the folder is in the trash. */
  isDeleted: number | boolean;
  /** Id of the folder whose deletion swept this one into the trash (itself for a trash root). */
  trashRootId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface FolderTreeItem {
  id: string;
  name: string;
  parentId: string | null;
  fileCount: number;
}

/** A row of `folders.children()`. */
export interface FolderChild extends FolderTreeItem {
  /** Whether the folder has live subfolders (0/1). */
  hasChildren: number | boolean;
}

/** A row of `folders.search()`. */
export interface FolderSearchResult {
  id: string;
  name: string;
  fileCount: number;
  /** Ancestor names root-first joined with `" / "`; `""` for a root folder. */
  path: string;
}

export interface BatchFolderInput {
  /** A single segment; paths are not split here. */
  name: string;
  /** `null` or omitted for the workspace root. */
  parentId?: string | null;
}

export interface BatchFolderResult {
  name: string;
  parentId: string | null;
  id: string;
  /** False when the folder already existed, or for a repeated entry. */
  created: boolean;
}

export interface RestoreFolderResult {
  folderId: string;
  /** The name it came back under (renamed on a collision). */
  name: string;
  /** True when the original parent is gone and the folder landed at the root. */
  restoredToRoot: boolean;
  filesRestored: number;
  foldersRestored: number;
}

export interface DeleteFolderOptions {
  /** Lower the R2 call budget of a permanent purge pass (cannot raise it). */
  maxR2Calls?: number;
}

/** First delete on a live folder: the subtree went to the trash. */
export interface FolderTrashResult {
  permanent: false;
  filesAffected: number;
  foldersRemoved: number;
}

/** Delete on a trashed root folder: one permanent purge pass. */
export interface FolderPurgeResult {
  permanent: true;
  /** False (HTTP 202) when the pass ran out of budget; call again to finish. */
  complete: boolean;
  /** Trashed files still left to purge. */
  remaining: number;
  /** Files purged by this pass. */
  filesAffected: number;
}

export type DeleteFolderResult = FolderTrashResult | FolderPurgeResult;

export interface PurgeFolderOptions extends DeleteFolderOptions {
  /** Give up after this many passes. Default 100. */
  maxPasses?: number;
  signal?: AbortSignal;
}

export interface PurgeFolderSummary {
  /** Files purged across every pass. */
  filesAffected: number;
  passes: number;
}
