import type { LockMode } from "./common.js";
import type { ShareStatus } from "./shares.js";

export interface SearchParams {
  workspaceId: string;
  /**
   * Search text (case-insensitive substring). A leading or trailing `ext:pdf`
   * token restricts files to that extension (`ext:pdf` alone lists every PDF);
   * folders and file requests then come back empty. Must not be empty.
   */
  q: string;
  /** 1-based. */
  page?: number;
  /** 1-100, default 50. Applied to each result set separately. */
  perPage?: number;
}

export interface SearchFileHit {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  extension: string | null;
  region: string;
  folderId: string | null;
  uploadedBy: string;
  uploaderName: string | null;
  lockMode: LockMode;
  createdAt: number;
}

export interface SearchFolderHit {
  id: string;
  name: string;
  parentId: string | null;
  fileCount: number;
  createdAt: number;
}

export interface SearchShareHit {
  linkId: string;
  token: string;
  status: ShareStatus;
  fileId: string | null;
  /** Null for a folder link. */
  fileName: string | null;
  folderId: string | null;
  folderName: string | null;
  isBundle: number | boolean | null;
  sizeBytes: number | null;
  extension: string | null;
  region: string | null;
  viewCount: number;
  downloadCount: number;
  isRevoked: number | boolean;
  expiresAt: number | null;
  sharedAt: number;
  createdBy: string;
  sharerName: string | null;
}

/** A file request hit. The upload token is never returned by search. */
export interface SearchFileRequestHit {
  id: string;
  /** null when the request has no title (a match on its message). */
  title: string | null;
  message: string | null;
  expiresAt: number | null;
  uploadCount: number;
  isRevoked: number | boolean;
  createdAt: number;
  createdByName: string | null;
}

export interface SearchPagination {
  page: number;
  perPage: number;
  /** Totals are approximate: hidden or locked rows withheld from other pages still count. */
  totalFiles: number;
  totalFolders: number;
  totalShares: number;
  totalRequests: number;
  /** True when any result set filled the page. */
  hasMore: boolean;
}

export interface SearchResponse {
  /** The query as searched (lowercased, `ext:` token included). */
  query: string;
  /** The `ext:` filter parsed from the query, without its dot. */
  ext: string | null;
  files: SearchFileHit[];
  folders: SearchFolderHit[];
  shared: SearchShareHit[];
  fileRequests: SearchFileRequestHit[];
  pagination: SearchPagination;
}
