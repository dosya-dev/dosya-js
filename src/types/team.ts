export interface TeamMember {
  /** Use with `team.updateMember()` / `team.removeMember()`. */
  membershipId: string;
  /** Use with `workspaces.transfer()`. */
  userId: string;
  roleId: string;
  joinedAt: number;
  /** Folder the member is confined to, or null for the whole workspace. */
  rootFolderId: string | null;
  /** null when unconfined or the folder is in the trash. */
  rootFolderName: string | null;
  name: string;
  email: string;
  avatarUrl: string | null;
  lastActiveAt: number | null;
  isYou: boolean;
}

export interface TeamInvite {
  id: string;
  email: string;
  roleId: string;
  createdAt: number;
  expiresAt: number;
  invitedByName: string | null;
  /** Accept link, for sharing the invite manually. */
  inviteUrl: string;
}

export interface TeamActivityItem {
  id: string;
  action: string;
  /** Raw JSON text of `meta`. */
  metadata: string | null;
  /** Parsed metadata; keys are passed through as the API sent them. */
  meta: Record<string, unknown> | null;
  createdAt: number;
  userName: string | null;
  userId: string | null;
  avatarUrl: string | null;
}

export interface TeamListResponse {
  workspace: { name: string; iconInitials: string; iconColor: string } | null;
  /** Oldest first, no paging. */
  members: TeamMember[];
  /** Pending, unexpired invites, newest first. */
  invites: TeamInvite[];
  /** The 6 most recent workspace events. */
  activity: TeamActivityItem[];
  stats: { members: number; pending: number; sharesThisWeek: number };
}

export interface InviteMemberParams {
  workspaceId: string;
  email: string;
  /**
   * A role id (`role_admin`, `role_member`, `role_viewer` or a custom role id)
   * or one of the labels `"Admin"`, `"Member"`, `"Viewer"`. Default `role_member`.
   */
  role?: string;
  /** Alias of `role`; ignored when `role` is given. */
  roleId?: string;
}

export interface UpdateMemberParams {
  /** New role id. `role_owner` is refused; use `workspaces.transfer()`. */
  roleId?: string;
  /** Confine the member to this folder; `null` or `""` removes the confinement. */
  rootFolderId?: string | null;
}

export interface InviteLink {
  id: string;
  token: string;
  roleId: string;
  /** The built-in role's label; for a custom role the API currently returns its id. */
  roleName: string;
  maxUses: number | null;
  useCount: number;
  expiresAt: number | null;
  isRevoked: number | boolean;
  createdAt: number;
  createdByName: string | null;
  /** Join URL: anyone holding it can join with `roleId`. */
  url: string;
}

export interface CreateInviteLinkParams {
  workspaceId: string;
  /** Role id or `"Admin"` / `"Member"` / `"Viewer"`. Default `role_member`. */
  role?: string;
  /** null = unlimited. */
  maxUses?: number | null;
  /** null or 0 = never expires. */
  expiresInDays?: number | null;
}

export interface CreatedInviteLink {
  id: string;
  token: string;
  url: string;
  roleId: string;
  roleName: string;
  maxUses: number | null;
  expiresAt: number | null;
}
