import { describe, it, expect } from "vitest";
import { ActivityResource } from "../../src/resources/activity.js";
import { mockApi, ok } from "./_mock.js";

const page = ok({
  activities: [{
    id: "ae1", action: "folder_renamed", entity_type: "folder", entity_id: "fld_1", metadata: '{"old_name":"a","new_name":"b"}',
    created_at: 10, actor_id: "u1", source_ip: null, user_agent: null, outcome: "success", source: "api", action_group: "files",
    on_behalf_of: null, resource_name: "b", request_id: null, session_id: null, actor_type: "user", obo_name: null, obo_email: null,
    user_name: "U", user_id: "u1", user_email: "u@x.y", user_avatar: null, geo: null, meta: { old_name: "a", new_name: "b" },
  }],
  members: [{ id: "u1", name: "U", email: "u@x.y", avatar_url: null }],
  pagination: { page: 1, per_page: 30, total: 1, total_pages: 1 },
});

describe("activity.list", () => {
  it("sends filters and returns the real entry shape", async () => {
    const api = mockApi({ "GET /api/activity": page });
    const activity = new ActivityResource(api.http());
    const res = await activity.list({ workspaceId: "ws_1", page: 1, perPage: 30, category: "folders", action: "folder_renamed", userId: "u1" });

    expect(api.calls[0].path).toBe("/api/activity");
    expect(api.calls[0].query).toEqual({
      workspace_id: "ws_1", page: "1", per_page: "30", category: "folders", action: "folder_renamed", user_id: "u1",
    });
    const a = res.activities[0];
    expect(a.entityType).toBe("folder");
    expect(a.entityId).toBe("fld_1");
    expect(a.userEmail).toBe("u@x.y");
    expect(a.outcome).toBe("success");
    expect(a.meta).toEqual({ old_name: "a", new_name: "b" });
    expect(a.metadata).toBe('{"old_name":"a","new_name":"b"}');
    expect(res.members[0].avatarUrl).toBeNull();
    expect(res.pagination).toEqual({ page: 1, perPage: 30, total: 1, totalPages: 1 });
  });

  it("joins list filters with commas", async () => {
    const api = mockApi({ "GET /api/activity": page });
    const activity = new ActivityResource(api.http());
    await activity.list({
      workspaceId: "ws_1",
      category: ["files", "sharing"],
      action: ["file_uploaded", "file_deleted"],
      userId: ["u1", "u2"],
    });
    expect(api.calls[0].query).toEqual({
      workspace_id: "ws_1", category: "files,sharing", action: "file_uploaded,file_deleted", user_id: "u1,u2",
    });
  });
});
