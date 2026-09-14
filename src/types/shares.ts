import type { LockMode } from "./common.js";

export type ShareAccessMode = "public" | "restricted";

export type ShareStatus = "active" | "expiring" | "expired" | "revoked";

/** Expiry for a share link. `expiresAt` (unix seconds) wins over `expiresInDays`. */
export interface ShareExpiry {
  /** Days from now. `0` means never, still capped by the workspace's maximum. */
  expiresInDays?: number | null;
  /** Unix seconds; at least a minute ahead and at most 3650 days out. */
  expiresAt?: number | null;
}

/** Options for creating a link to a file or a folder. */
export interface CreateShareLinkParams extends ShareExpiry {
  /** At least 8 characters. Required for `full_lock`, or when the workspace forces share passwords. */
  password?: string;
  lockMode?: LockMode;
  /** `"restricted"` links only open for `recipientEmails`, verified by an emailed code. */
  accessMode?: ShareAccessMode;
  /** 1-50 addresses; required when `accessMode` is `"restricted"`. */
  recipientEmails?: string[];
  /** Stop serving downloads after this many (1-10 000). `null` means unlimited. */
  maxDownloads?: number | null;
}

/** Options for emailing a link to a file or a folder. */
export interface ShareByEmailParams extends ShareExpiry {
  /** Up to 50 recipients. */
  emails: string[];
  /** Up to 500 characters. */
  message?: string;
  /** At least 8 characters. */
  password?: string;
  /** Only the listed recipients can open the link. */
  restrictToRecipients?: boolean;
}

/** @deprecated Use ShareByEmailParams. */
export type ShareEmailParams = ShareByEmailParams;

export interface CreateShareBundleParams extends ShareExpiry {
  /** 1-100 files, all in the same workspace. */
  fileIds: string[];
  password?: string;
  accessMode?: ShareAccessMode;
  recipientEmails?: string[];
  /** Email the link to `recipientEmails`. */
  notify?: boolean;
  /** Up to 500 characters, included in the email. */
  message?: string;
}

/** The link as returned right after it is created. */
export interface CreatedShareLink {
  id: string;
  token: string;
  /** Public URL to hand to recipients. */
  url: string;
  lockMode: LockMode;
  accessMode: ShareAccessMode;
  expiresAt: number | null;
  createdAt: number;
}

export interface CreatedShareBundle {
  link: CreatedShareLink & { fileCount: number };
  /** Addresses the link was emailed to (when `notify` was set). */
  sent: number;
  /** Addresses the email could not be delivered to. */
  failed: string[];
}

export interface ShareByEmailResult {
  shareUrl: string;
  accessMode: ShareAccessMode;
  sent: number;
  failed: string[];
}

/** A live link on one file or folder (`GET /api/files/:id/share`, `GET /api/folders/:id/share`). */
export interface ItemShareLink {
  id: string;
  token: string;
  url: string;
  isPasswordProtected: boolean | number;
  expiresAt: number | null;
  viewCount: number;
  downloadCount: number;
  isRevoked: boolean | number;
  lockMode: LockMode;
  createdAt: number;
}

/** @deprecated Use ItemShareLink (per item) or WorkspaceShareLink (workspace list). */
export type ShareLinkDetail = ItemShareLink;

/** A row of `shares.list()`: every link in a workspace, newest first. */
export interface WorkspaceShareLink {
  linkId: string;
  token: string;
  url: string;
  status: ShareStatus;
  isBundle: boolean | number;
  isFolder: boolean;
  /** Created by the caller. */
  isMine: boolean;
  /** The folder or file name, or `"(deleted)"`. */
  displayName: string;
  /** null for folder links. A bundle carries its first file. */
  fileId: string | null;
  fileName: string | null;
  folderId: string | null;
  folderName: string | null;
  sizeBytes: number | null;
  extension: string | null;
  region: string | null;
  lockMode: LockMode;
  accessMode: ShareAccessMode;
  isPasswordProtected: boolean | number;
  maxDownloads: number | null;
  recipientCount: number;
  viewCount: number;
  downloadCount: number;
  isRevoked: boolean | number;
  revokedAt: number | null;
  expiresAt: number | null;
  sharedAt: number;
  createdBy: string;
  sharerName: string | null;
}

export interface SharesListResponse {
  /** At most 100, newest first, revoked and expired included. Links to items hidden from the caller are left out. */
  links: WorkspaceShareLink[];
  stats: {
    total: number;
    active: number;
    expiring: number;
    totalViews: number;
  };
}

/** Fields that can be changed on an existing link. At least one is required. */
export interface UpdateShareLinkParams extends ShareExpiry {
  /** At least 8 characters. `""` or `null` removes the password. */
  password?: string | null;
  lockMode?: LockMode;
  accessMode?: ShareAccessMode;
  /** Replaces the whole recipient list (1-50 addresses for a restricted link). */
  recipientEmails?: string[];
  /** 1-10 000, or `null` for unlimited. */
  maxDownloads?: number | null;
}

export interface UpdatedShareLink {
  linkId: string;
  expiresAt: number | null;
  isPasswordProtected: boolean | number;
  lockMode: LockMode;
  accessMode: ShareAccessMode;
  recipientCount: number;
  downloadCount: number;
  maxDownloads: number | null;
}

export interface ShareAnalyticsParams {
  /** Days. Default 30. */
  range?: 7 | 30 | 90;
  /** Offset into the access log (25 rows per page). */
  offset?: number;
}

export interface ShareAnalytics {
  link: {
    linkId: string;
    url: string;
    displayName: string;
    isFolder: boolean;
    isBundle: boolean;
    fileId: string | null;
    sizeBytes: number | null;
    extension: string | null;
    region: string | null;
    createdAt: number;
    createdBy: string;
    createdByName: string | null;
    isMine: boolean;
    expiresAt: number | null;
    isRevoked: boolean;
    revokedAt: number | null;
    isPasswordProtected: boolean;
    lockMode: LockMode;
    accessMode: ShareAccessMode;
    status: ShareStatus;
    viewCount: number;
    downloadCount: number;
    maxDownloads: number | null;
    /** null when downloads are not capped. */
    downloadsLeft: number | null;
  };
  range: number;
  /** One row per day in the range. `opens` are first opens per distinct address. */
  timeline: Array<{ day: string; opens: number; downloads: number }>;
  reach: {
    visitors: number;
    /** True when there were more visitors than the 5000 counted. */
    truncated: boolean;
    devices: Array<{ label: string; count: number }>;
    browsers: Array<{ label: string; count: number }>;
  };
  /** null for public links. */
  recipients: Array<{ email: string; verifiedAt: number | null; invitedAt: number }> | null;
  log: {
    total: number;
    offset: number;
    limit: number;
    rows: Array<{
      id: string;
      /** A short opaque handle, not an identity. */
      visitor: string;
      event: "view" | "download";
      device: string | null;
      deviceLabel: string | null;
      /** ISO 3166-1 alpha-2, or null. */
      country: string | null;
      viewedAt: number;
    }>;
  };
  /** What the analytics cannot report, as human-readable notes. */
  gaps: { repeatVisits: string; perRecipient: string | null };
}

/** A link someone sent to the caller's verified email address. */
export interface SharedWithMeLink {
  linkId: string;
  url: string;
  displayName: string;
  isFolder: boolean;
  isBundle: boolean;
  sizeBytes: number | null;
  extension: string | null;
  isPasswordProtected: boolean | number;
  lockMode: LockMode;
  expiresAt: number | null;
  revokedAt: number | null;
  status: ShareStatus;
  sharedAt: number;
  invitedAt: number;
  /** When the caller first verified this address for the link; null if never opened. */
  verifiedAt: number | null;
  senderName: string | null;
}

export interface SharedWithMeResponse {
  /** At most 100, newest invitation first. Empty when the account email is unverified. */
  links: SharedWithMeLink[];
  emailVerified: boolean;
  /** Absent when the email is unverified. */
  stats?: { total: number; active: number; unopened: number };
}
