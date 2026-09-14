export interface CreateWorkspaceParams {
  /** 1-80 characters. */
  name: string;
  /** Shown as given on create (keep it to 1-4 characters); `update()` uppercases and truncates to 4. */
  iconInitials?: string;
  /** CSS colour, e.g. `"#3B82F6"`. */
  iconColor?: string;
  /**
   * Storage location code (see `regions.list()`). Fixed for the life of the
   * workspace. When omitted the server picks one near the caller.
   */
  defaultRegion?: string;
  /** Whole GB cap for this workspace, drawn from the owner's unallocated plan storage. */
  maxTotalStorageGb?: number | null;
}

/** Name and icon only. The location cannot be changed after creation. */
export interface UpdateWorkspaceParams {
  name?: string;
  iconInitials?: string;
  iconColor?: string;
}

/** Storage figures for one workspace. `free` is what an upload can actually use. */
export interface WorkspaceStorage {
  used: number;
  /** The workspace cap when set, else the owner's account limit. */
  total: number;
  /** Bounded by both the workspace cap and the owner's remaining account storage. */
  free: number;
  capBytes: number | null;
  accountLimitBytes: number;
  accountUsedBytes: number;
}

/** How much of an owner's plan storage is promised to workspace caps. */
export interface CapAllocation {
  planGb: number;
  allocatedGb: number;
  remainingGb: number;
}

export interface WorkspaceListItem {
  id: string;
  name: string;
  slug: string;
  iconInitials: string;
  iconColor: string;
  /** Storage key of an uploaded icon, or null. */
  iconImageUrl: string | null;
  ownerId: string;
  defaultRegion: string;
  plan: string;
  createdAt: number;
  storageUsedBytes: number | null;
  /** The caller's role in this workspace. */
  roleId: string;
  joinedAt: number;
  require2fa: number | boolean;
  disablePasswordLogin: number | boolean;
  maxTotalStorageGb: number | null;
  storage: WorkspaceStorage;
}

export interface WorkspaceListResponse {
  /** Oldest first. A workspace-pinned key sees only its own workspace. */
  workspaces: WorkspaceListItem[];
  /** The caller's allocation as an owner. */
  allocation: CapAllocation;
  userEmail: string;
  userHas2fa: boolean;
  userLoginMethod: string;
}

export interface WorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  iconInitials: string;
  iconColor: string;
  iconImageUrl: string | null;
  ownerId: string;
  defaultRegion: string;
  storageUsedBytes: number;
  createdAt: number;
}

/** The full `workspace_settings` row, as returned by `workspaces.get()`. */
export interface WorkspaceSettings {
  workspaceId: string;
  /** null = unlimited. */
  maxFileSizeGb: number | null;
  maxStoragePerMemberGb: number | null;
  maxTotalStorageGb: number | null;
  maxConcurrentUploads: number;
  /** Comma-separated, dot-prefixed, e.g. `".pdf,.mp4"`. */
  allowedExtensions: string | null;
  blockedExtensions: string | null;
  notifyOnUpload: number | boolean;
  autoShareLink: number | boolean;
  downloadTracking: number | boolean;
  /** JSON array text of CIDRs. */
  ipAllowlist: string | null;
  ipBlocklist: string | null;
  /** JSON array text of ISO country codes. */
  countryAllowlist: string | null;
  countryBlocklist: string | null;
  sessionTimeoutMinutes: number | null;
  disableShareLinks: number | boolean;
  forceSharePassword: number | boolean;
  shareMaxExpiryDays: number | null;
  defaultShareExpiryDays: number | null;
  require2fa: number | boolean;
  /** JSON array text of domains. */
  allowedEmailDomains: string | null;
  disablePasswordLogin: number | boolean;
  /** Downloads per hour per user; null = unlimited. */
  downloadRateLimit: number | null;
  downloadWatermark: number | boolean;
  maxVersions: number | null;
  /** Ignored since workspace locations became fixed. */
  availableRegions: string | null;
  recordUploadOrigin: number | boolean;
  duplicateScanEnabled: number | boolean;
  createdAt: number | null;
  updatedAt: number;
}

export interface WorkspaceDetailResponse {
  workspace: WorkspaceDetail;
  settings: WorkspaceSettings | null;
  /** The caller's role. */
  roleId: string;
  isOwner: boolean;
  /** The owner's effective plan id. */
  plan: string;
  storage: WorkspaceStorage;
  planLimits: { storageGb: number };
  /** The owner's allocation. */
  allocation: CapAllocation;
}

/**
 * Fields accepted by `workspaces.updateSettings()`. Numeric fields take `null`
 * to clear. List fields take an array (sent JSON-encoded) or `null`.
 */
export interface WorkspaceSettingsUpdate {
  maxFileSizeGb: number | null;
  maxStoragePerMemberGb: number | null;
  /** At least 1; all caps across an owner's workspaces share one plan pool. */
  maxTotalStorageGb: number | null;
  /** At least 1. */
  maxConcurrentUploads: number;
  sessionTimeoutMinutes: number | null;
  shareMaxExpiryDays: number | null;
  /** Whole days, 1-3650, and not above `shareMaxExpiryDays`. */
  defaultShareExpiryDays: number | null;
  downloadRateLimit: number | null;
  notifyOnUpload: boolean;
  autoShareLink: boolean;
  downloadTracking: boolean;
  disableShareLinks: boolean;
  forceSharePassword: boolean;
  require2fa: boolean;
  disablePasswordLogin: boolean;
  recordUploadOrigin: boolean;
  duplicateScanEnabled: boolean;
  /** Comma-separated, dot-prefixed, e.g. `".pdf,.docx"`. */
  allowedExtensions: string | null;
  blockedExtensions: string | null;
  /** CIDRs, e.g. `["192.168.1.0/24"]`. */
  ipAllowlist: string[] | null;
  ipBlocklist: string[] | null;
  /** ISO 3166-1 alpha-2 codes. */
  countryAllowlist: string[] | null;
  countryBlocklist: string[] | null;
  /** Domains invites are limited to, e.g. `["company.com"]`. */
  allowedEmailDomains: string[] | null;
}

/** The share-relevant settings any member may read. */
export interface WorkspaceShareSettings {
  defaultShareExpiryDays: number | null;
  shareMaxExpiryDays: number | null;
  disableShareLinks: number | boolean;
  forceSharePassword: number | boolean;
}

export interface WorkspaceUploadLimits {
  /** Comma-separated, lowercase, dot-prefixed. null = all allowed. */
  allowedExtensions: string | null;
  blockedExtensions: string | null;
  maxFileSizeGb: number | null;
  /** A hint (cached up to 60 s); the upload gate decides. null when unknown. */
  storageRemainingBytes: number | null;
  /** Open upload sessions one member may hold. 0 = no limit. */
  maxConcurrentUploads: number | null;
}

export interface WorkspaceDeletePreview {
  workspaceId: string;
  workspaceName: string;
  /** Trashed items included. */
  fileCount: number;
  totalBytes: number;
  folderCount: number;
  /** Members other than the owner. */
  memberCount: number;
  /** Reasons `delete()` would be refused right now. */
  blockers: Array<"has_members" | "last_workspace">;
}

export interface DeleteWorkspaceParams {
  /** The 6-digit code emailed by `requestDeletion()`. */
  code: string;
  /** Must equal the workspace's name. */
  confirmName: string;
}

export interface DeleteWorkspaceResult {
  /** True when the deletion was accepted but is still running (HTTP 202). */
  pending?: boolean;
  operationId?: string;
}

export interface WorkspaceDeletionRequest {
  /** Unix seconds; the code is valid for 15 minutes. */
  expiresAt: number;
  /** The owner's email address the code was sent to. */
  sentTo: string;
}
