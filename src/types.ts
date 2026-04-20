// ── Client options ──

export interface DosyaClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  retry?: RetryOptions;
  onRateLimit?: (info: RateLimitInfo) => void;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: number;
}

// ── Pagination ──

export interface PaginationMeta {
  page: number;
  perPage: number;
  totalFiles: number;
  totalPages: number;
}

// ── Files ──

export interface ListFilesParams {
  workspaceId: string;
  folderId?: string | null;
  filter?: "all" | "documents" | "videos" | "images";
  sort?: "newest" | "oldest" | "name_asc" | "name_desc" | "largest" | "smallest";
  q?: string;
  deleted?: boolean;
  hidden?: boolean;
  page?: number;
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
  uploaderName: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  lockMode: string;
  isHidden: number;
  hiddenMode: string;
  currentVersion: number;
  isSynced: number;
  shareCount: number;
  commentCount: number;
}

export interface FolderListItem {
  id: string;
  name: string;
  createdAt: number;
  fileCount: number;
  lockMode: string;
  isHidden: number;
  hiddenMode: string;
  isSynced: number;
}

export interface Breadcrumb {
  id: string;
  name: string;
}

export interface ListFilesResponse {
  folders: FolderListItem[];
  files: FileListItem[];
  breadcrumbs: Breadcrumb[];
  workspaceId: string;
  folderId: string | null;
  canLock: boolean;
  canHide: boolean;
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
  uploaderName: string | null;
  folderId: string | null;
  workspaceId: string;
  currentVersion: number;
  lockMode: string;
  isHidden: number;
  hiddenMode: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface FileVersion {
  id: string;
  versionNumber: number;
  sizeBytes: number;
  mimeType: string;
  extension: string | null;
  uploadedBy: string;
  uploaderName: string | null;
  createdAt: number;
}

// ── Upload ──

export type UploadSource =
  | File
  | Blob
  | ArrayBuffer
  | Uint8Array
  | ReadableStream<Uint8Array>;

export interface UploadParams {
  workspaceId: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  region?: string;
  folderId?: string | null;
  fileId?: string | null;
  body: UploadSource;
  onProgress?: (progress: UploadProgress) => void;
  abortSignal?: AbortSignal;
}

export interface UploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  percent: number;
  partsCompleted?: number;
  totalParts?: number;
  status: "initializing" | "uploading" | "completing" | "complete";
}

export interface UploadResult {
  file: {
    id: string;
    name: string;
    r2Key: string;
    sizeBytes: number;
    mimeType: string;
    extension: string | null;
    region: string;
    version: number;
    createdAt: number;
  };
  sessionId: string;
}

export interface UploadInitResponse {
  sessionId: string;
  uploadUrl: string;
  workspaceId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  extension: string;
  region: string;
  resumable: {
    partSize: number;
    totalParts: number;
    partUploadUrl: string;
    completeUrl: string;
    statusUrl: string;
  } | null;
}

export interface UploadStatusResponse {
  sessionId: string;
  status: string;
  sizeBytes: number;
  partSize: number | null;
  totalParts: number | null;
  bytesUploaded: number;
  uploadedParts: number[];
  hasMultipart: boolean;
}

// ── Download ──

export interface DownloadOptions {
  version?: number;
  unlockToken?: string;
}

// ── Shares ──

export interface CreateShareLinkParams {
  expiresInDays?: number;
  password?: string;
  lockMode?: "none" | "view_only" | "full_lock";
}

export interface ShareEmailParams {
  emails: string[];
  message?: string;
}

export interface CreateShareBundleParams {
  fileIds: string[];
  expiresInDays?: number;
  password?: string;
}

export interface ShareLinkDetail {
  id: string;
  fileId: string;
  fileName: string;
  token: string;
  isPasswordProtected: number;
  expiresAt: number | null;
  downloadCount: number;
  createdAt: number;
  createdBy: string;
  status: string;
}

export interface SharesListResponse {
  links: ShareLinkDetail[];
  stats: {
    total: number;
    active: number;
    expiring: number;
    totalViews: number;
  };
}

// ── Folders ──

export interface CreateFolderParams {
  workspaceId: string;
  parentId?: string | null;
  name: string;
}

export interface FolderDetail {
  id: string;
  name: string;
  parentId: string | null;
  workspaceId: string;
  createdAt: number;
}

export interface FolderTreeItem {
  id: string;
  name: string;
  parentId: string | null;
  fileCount: number;
}

// ── Workspaces ──

export interface CreateWorkspaceParams {
  name: string;
  iconInitials?: string;
  iconColor?: string;
  defaultRegion?: string;
}

export interface UpdateWorkspaceParams {
  name?: string;
  iconInitials?: string;
  iconColor?: string;
  defaultRegion?: string;
}

export interface WorkspaceListItem {
  id: string;
  name: string;
  slug: string;
  iconInitials: string;
  iconColor: string;
  ownerId: string;
  role: string;
  roleId: string;
  memberCount: number;
  storageUsedBytes: number;
  createdAt: number;
}

export interface WorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  iconInitials: string;
  iconColor: string;
  iconUrl: string | null;
  ownerId: string;
  storageUsedBytes: number;
  createdAt: number;
}

export interface WorkspaceSettings {
  maxFileSizeGb: number;
  maxTotalStorageGb: number;
  maxStoragePerMemberGb: number;
  maxConcurrentUploads: number;
  allowedExtensions: string | null;
  blockedExtensions: string | null;
  require2fa: number;
  disableShareLinks: number;
  forceSharePassword: number;
  shareMaxExpiryDays: number | null;
}

// ── File Requests ──

export interface CreateFileRequestParams {
  workspaceId: string;
  folderId?: string | null;
  title?: string;
  message?: string;
  password?: string;
  expiresInDays?: number;
  allowedExtensions?: string;
  maxFileSizeMb?: number;
  maxFiles?: number;
  emails?: string[];
}

export interface FileRequestDetail {
  id: string;
  token: string;
  url: string;
  title: string | null;
  message: string | null;
  isPasswordProtected: number;
  expiresAt: number | null;
  uploadCount: number;
  createdAt: number;
}

// ── Search ──

export interface SearchParams {
  workspaceId: string;
  q: string;
  page?: number;
  perPage?: number;
}

export interface SearchResponse {
  query: string;
  files: Array<{
    id: string;
    name: string;
    sizeBytes: number;
    mimeType: string;
    extension: string | null;
    createdAt: number;
  }>;
  folders: Array<{
    id: string;
    name: string;
    createdAt: number;
  }>;
  shared: Array<{
    id: string;
    fileName: string;
    token: string;
    createdAt: number;
  }>;
  fileRequests: Array<{
    id: string;
    title: string | null;
    token: string;
    createdAt: number;
  }>;
  pagination: PaginationMeta;
}

// ── Comments ──

export interface CreateCommentParams {
  workspaceId: string;
  fileId?: string;
  folderId?: string;
  parentId?: string;
  body: string;
}

export interface CommentDetail {
  id: string;
  body: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  parentId: string | null;
  createdAt: number;
  updatedAt: number | null;
}

// ── Activity ──

export interface ListActivityParams {
  workspaceId: string;
  page?: number;
  perPage?: number;
  category?: string;
  action?: string;
  userId?: string;
}

export interface ActivityEntry {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  metadata: string | null;
  createdAt: number;
}

export interface ActivityListResponse {
  activities: ActivityEntry[];
  members: Array<{
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  }>;
  pagination: PaginationMeta;
}

// ── Me ──

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  preferredLanguage: string;
  createdAt: number;
  emailVerifiedAt: number | null;
  workspaceCount: number;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  scope: string;
  keyPrefix: string;
  lastUsedAt: number | null;
  expiresAt: number | null;
  createdAt: number;
}

export interface CreateApiKeyParams {
  name: string;
  scope?: "full" | "read" | "upload";
  expiresInDays?: number;
}

export interface CreatedApiKey {
  id: string;
  name: string;
  scope: string;
  plainKey: string;
  expiresAt: number | null;
  createdAt: number;
}

// ── Lock / Hide ──

export interface LockInfo {
  lockMode: string;
  lockedBy: string | null;
  lockedByName: string | null;
  lockedAt: number | null;
}

export interface SetLockParams {
  lockMode: "view_only" | "full_lock";
  password?: string;
}

export interface SetHideParams {
  hiddenMode?: "everyone" | "users" | "roles";
  targetIds?: string[];
}

// ── HTTP internals ──

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  rawResponse?: boolean;
}
