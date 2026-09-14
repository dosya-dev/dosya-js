export type ActivityCategory = "files" | "folders" | "sharing" | "members" | "workspace" | "comments";

export interface ListActivityParams {
  workspaceId: string;
  /** 1-based. */
  page?: number;
  /** 10-100, default 30. Values below 10 are raised to 10. */
  perPage?: number;
  /** One or more categories. Unknown values are ignored by the API (no filter). */
  category?: ActivityCategory | ActivityCategory[];
  /** One or more action names, e.g. `"file_uploaded"`. */
  action?: string | string[];
  /** One or more actor user ids (at most 50 are honoured). */
  userId?: string | string[];
}

export interface ActivityEntry {
  id: string;
  action: string;
  /** e.g. `"file"`, `"folder"`, `"member"`. */
  entityType: string;
  entityId: string | null;
  /** Null when the caller cannot open the item. */
  resourceName: string | null;
  createdAt: number;
  /** Null for system actors and for actors whose account no longer exists (see `actorId`). */
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userAvatar: string | null;
  actorId: string | null;
  actorType: string;
  outcome: string;
  source: string;
  actionGroup: string;
  onBehalfOf: string | null;
  oboName: string | null;
  oboEmail: string | null;
  /** The next four and `geo` are null for non-owner/admin callers viewing other members' rows. */
  requestId: string | null;
  sessionId: string | null;
  sourceIp: string | null;
  userAgent: string | null;
  geo: Record<string, unknown> | null;
  /**
   * Parsed metadata with its original (snake_case) keys, e.g. `old_name`.
   * Reduced to a safe subset for callers who are not owner or admin viewing
   * other members' rows.
   */
  meta: Record<string, unknown> | null;
  /** The same metadata as a raw JSON string. */
  metadata: string | null;
}

export interface ActivityPagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface ActivityListResponse {
  activities: ActivityEntry[];
  /** Every workspace member, for filter pickers. */
  members: Array<{
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  }>;
  pagination: ActivityPagination;
}
