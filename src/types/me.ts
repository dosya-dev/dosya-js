/** The authenticated user, as returned by `GET /api/me`. */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  initials: string;
  /**
   * Storage key of the avatar image (e.g. `avatars/<userId>/avatar.png`), NOT a
   * fetchable URL. `null` when the user has no avatar.
   */
  avatarUrl: string | null;
  /** Unix seconds when a pending account deletion will run; `null` when none is scheduled. */
  deletionScheduledFor: number | null;
  preferredLanguage: string;
  uiTheme: string;
  uiMode: string;
  createdAt: number;
  emailVerifiedAt: number | null;
  /** `false` for OAuth-created accounts that never set a password. */
  hasPassword: boolean;
  workspaceCount: number;
  tourCompleted: boolean;
}

/** The caller's effective permissions in one workspace (`GET /api/me/permissions`). */
export interface MyWorkspacePermissions {
  userId: string;
  roleId: string;
  roleName: string | null;
  isBuiltin: boolean;
  /** Set when the caller is a folder-confined member: the folder they are anchored at. */
  rootFolderId: string | null;
  /** Name of the anchor folder; `null` when not confined or the folder was trashed. */
  rootFolderName: string | null;
  /**
   * Every permission key the API knows, `true` or `false`. Keys stay snake_case
   * as the API sends them (e.g. `upload_files`, `manage_settings`).
   */
  permissions: Record<string, boolean>;
}
