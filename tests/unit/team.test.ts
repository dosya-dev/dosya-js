import { describe, it, expect } from "vitest";
import { mockApi, ok } from "./_mock.js";
import { TeamResource } from "../../src/resources/team.js";

describe("TeamResource", () => {
  it("list() queries workspace_id and camelCases members, invites and activity (meta untouched)", async () => {
    const api = mockApi({
      "GET /api/team": ok({
        workspace: { name: "Team", icon_initials: "TE", icon_color: "#000" },
        members: [
          {
            membership_id: "wm_1",
            user_id: "usr_1",
            role_id: "role_owner",
            joined_at: 1,
            root_folder_id: null,
            root_folder_name: null,
            name: "A",
            email: "a@x.y",
            avatar_url: null,
            last_active_at: 5,
            is_you: true,
          },
        ],
        invites: [
          { id: "inv_1", email: "b@x.y", role_id: "role_member", created_at: 1, expires_at: 2, invited_by_name: "A", invite_url: "https://x/invite/t" },
        ],
        activity: [{ id: "ev_1", action: "member_invited", metadata: "{}", meta: { file_name: "x" }, created_at: 1, user_name: "A", user_id: "usr_1", avatar_url: null }],
        stats: { members: 1, pending: 1, shares_this_week: 3 },
      }),
    });
    const res = await new TeamResource(api.http()).list("ws_1");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    expect(res.members[0].membershipId).toBe("wm_1");
    expect(res.members[0].isYou).toBe(true);
    expect(res.invites[0].inviteUrl).toBe("https://x/invite/t");
    expect(res.activity[0].meta).toEqual({ file_name: "x" });
    expect(res.stats.sharesThisWeek).toBe(3);
    expect(res.workspace?.iconInitials).toBe("TE");
  });

  it("invite() sends workspace_id, email and role; returns inviteId", async () => {
    const api = mockApi({ "POST /api/team/invite": ok({ invite_id: "inv_9" }, 201) });
    const res = await new TeamResource(api.http()).invite({ workspaceId: "ws_1", email: "c@x.y", role: "Viewer" });
    expect(api.calls[0].body).toEqual({ workspace_id: "ws_1", email: "c@x.y", role: "Viewer" });
    expect(res).toEqual({ inviteId: "inv_9" });
  });

  it("invite() maps roleId onto role and omits role when neither is given", async () => {
    const api = mockApi({ "POST /api/team/invite": ok({ invite_id: "inv_9" }, 201) });
    const team = new TeamResource(api.http());
    await team.invite({ workspaceId: "ws_1", email: "c@x.y", roleId: "role_custom" });
    await team.invite({ workspaceId: "ws_1", email: "d@x.y" });
    expect(api.calls[0].body).toEqual({ workspace_id: "ws_1", email: "c@x.y", role: "role_custom" });
    expect(api.calls[1].body).toEqual({ workspace_id: "ws_1", email: "d@x.y" });
  });

  it("resendInvite() and revokeInvite() POST to the invite paths with encoded ids", async () => {
    const api = mockApi({
      "POST /api/team/invites/inv%201/resend": ok(),
      "POST /api/team/invites/inv_1/revoke": ok(),
    });
    const team = new TeamResource(api.http());
    await team.resendInvite("inv 1");
    await team.revokeInvite("inv_1");
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /api/team/invites/inv%201/resend",
      "POST /api/team/invites/inv_1/revoke",
    ]);
  });

  it("updateMember() PUTs only the given fields, keeping null", async () => {
    const api = mockApi({ "PUT /api/team/members/wm_1": ok({ root_folder_id: null, role_id: "role_viewer" }) });
    const team = new TeamResource(api.http());
    const res = await team.updateMember("wm_1", { roleId: "role_viewer", rootFolderId: null });
    expect(api.calls[0].body).toEqual({ role_id: "role_viewer", root_folder_id: null });
    expect(res).toEqual({ rootFolderId: null, roleId: "role_viewer" });
    await team.updateMember("wm_1", { roleId: "role_member" });
    expect(api.calls[1].body).toEqual({ role_id: "role_member" });
  });

  it("removeMember() DELETEs the membership", async () => {
    const api = mockApi({ "DELETE /api/team/members/wm_1": ok() });
    await new TeamResource(api.http()).removeMember("wm_1");
    expect(api.calls[0].method).toBe("DELETE");
  });

  it("invite links: list, create, revoke", async () => {
    const api = mockApi({
      "GET /api/team/invite-link": ok({
        links: [{ id: "il_1", token: "t", role_id: "role_member", max_uses: null, use_count: 0, expires_at: null, is_revoked: 0, created_at: 1, created_by_name: "A", role_name: "Member", url: "https://x/join/t" }],
      }),
      "POST /api/team/invite-link": ok(
        { link: { id: "il_2", token: "u", url: "https://x/join/u", role_id: "role_viewer", role_name: "Viewer", max_uses: 5, expires_at: 99 } },
        201,
      ),
      "DELETE /api/team/invite-link": ok(),
    });
    const team = new TeamResource(api.http());
    const list = await team.listInviteLinks("ws_1");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    expect(list.links[0].useCount).toBe(0);

    const created = await team.createInviteLink({ workspaceId: "ws_1", role: "Viewer", maxUses: 5, expiresInDays: 7 });
    expect(api.calls[1].body).toEqual({ workspace_id: "ws_1", role: "Viewer", max_uses: 5, expires_in_days: 7 });
    expect(created.link.roleName).toBe("Viewer");

    await team.revokeInviteLink("il_2");
    expect(api.calls[2].query).toEqual({ id: "il_2" });
    await expect(team.revokeInviteLink("")).rejects.toThrow(TypeError);
  });
});
