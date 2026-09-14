import { seg, type HttpClient } from "../http.js";
import type {
  CreateInviteLinkParams,
  CreatedInviteLink,
  InviteLink,
  InviteMemberParams,
  TeamListResponse,
  UpdateMemberParams,
} from "../types/team.js";

/**
 * Workspace members and invitations.
 *
 * Key scope: GET needs `read` or `full`, the rest `full`; `upload` keys cannot
 * call these. Workspace-pinned keys can only call `list()` and
 * `listInviteLinks()` (for their own workspace); every other method is refused
 * for them (403).
 */
export class TeamResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Members, pending invites (with accept URLs), recent activity and counts.
   * Needs `access_team` and `view_team_members`.
   */
  async list(workspaceId: string): Promise<TeamListResponse> {
    return this.http.request({ method: "GET", path: "/api/team", query: { workspaceId } });
  }

  /**
   * Invite someone by email (the invite expires in 7 days). Needs `invite_members`
   * and cannot grant a role above the caller's own (403). 409 when already a
   * member or already invited; 403 outside the workspace's allowed email domains
   * or past the plan's member limit. dosya.dev addresses are refused (400) unless
   * the caller is a dosya.dev account.
   */
  async invite(params: InviteMemberParams): Promise<{ inviteId: string }> {
    return this.http.request({
      method: "POST",
      path: "/api/team/invite",
      body: { workspaceId: params.workspaceId, email: params.email, role: params.role ?? params.roleId },
    });
  }

  /** Email a pending invite again. 409 when accepted, revoked or expired; 503 when email is not configured. */
  async resendInvite(inviteId: string): Promise<void> {
    await this.http.request({ method: "POST", path: `/api/team/invites/${seg(inviteId)}/resend` });
  }

  /** Revoke a pending invite. 409 when already revoked. */
  async revokeInvite(inviteId: string): Promise<void> {
    await this.http.request({ method: "POST", path: `/api/team/invites/${seg(inviteId)}/revoke` });
  }

  /**
   * Change a member's role and/or folder confinement. Omitted fields are left
   * alone. Needs `manage_roles`. 400 for the owner, for your own role or
   * confinement, or an unknown role/folder; 403 for a role above your own.
   */
  async updateMember(
    membershipId: string,
    params: UpdateMemberParams,
  ): Promise<{ rootFolderId: string | null; roleId: string }> {
    return this.http.request({
      method: "PUT",
      path: `/api/team/members/${seg(membershipId)}`,
      body: { roleId: params.roleId, rootFolderId: params.rootFolderId },
    });
  }

  /** Remove a member. Needs `manage_roles` unless removing yourself; the owner cannot be removed (400). */
  async removeMember(membershipId: string): Promise<void> {
    await this.http.request({
      method: "DELETE",
      path: `/api/team/members/${seg(membershipId)}`,
      retry: "never",
    });
  }

  /** Active join links, with their URLs. Needs `invite_members`. */
  async listInviteLinks(workspaceId: string): Promise<{ links: InviteLink[] }> {
    return this.http.request({ method: "GET", path: "/api/team/invite-link", query: { workspaceId } });
  }

  /**
   * Create a join link anyone holding it can use. Needs `invite_members` and
   * cannot grant a role above the caller's own.
   */
  async createInviteLink(params: CreateInviteLinkParams): Promise<{ link: CreatedInviteLink }> {
    return this.http.request({
      method: "POST",
      path: "/api/team/invite-link",
      body: {
        workspaceId: params.workspaceId,
        role: params.role,
        maxUses: params.maxUses,
        expiresInDays: params.expiresInDays,
      },
    });
  }

  /** Revoke a join link. */
  async revokeInviteLink(linkId: string): Promise<void> {
    seg(linkId); // validates: an empty id would otherwise be dropped from the query
    await this.http.request({ method: "DELETE", path: "/api/team/invite-link", query: { id: linkId } });
  }
}
