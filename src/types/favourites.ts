import type { LockMode } from "./common.js";

export interface FavouriteFolder {
  /** Favourite id (`fav_...`). */
  id: string;
  folderId: string;
  /** When it was starred (unix seconds). */
  createdAt: number;
  folderName: string;
  parentId: string | null;
}

export interface FavouriteFile {
  /** Favourite id (`fav_...`). */
  id: string;
  fileId: string;
  /** When it was starred (unix seconds). */
  createdAt: number;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  extension: string | null;
  lockMode: LockMode;
  currentVersion: number;
  folderId: string | null;
}

export interface FavouritesList {
  /** Sorted by name. Trashed, hidden and lock-sealed items are left out. */
  folders: FavouriteFolder[];
  /** Sorted by name. Trashed, hidden and lock-sealed items are left out. */
  files: FavouriteFile[];
}

/** One target: a folder or a file. */
export type FavouriteTarget =
  | { workspaceId: string; folderId: string; fileId?: never }
  | { workspaceId: string; fileId: string; folderId?: never };
