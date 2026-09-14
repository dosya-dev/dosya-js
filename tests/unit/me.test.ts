import { describe, it, expect } from "vitest";
import { mockApi, ok, fail } from "./_mock.js";
import { MeResource } from "../../src/resources/me.js";
import { DosyaApiError } from "../../src/errors.js";

describe("MeResource", () => {
  it("profile() GETs /api/me and camelCases every field", async () => {
    const api = mockApi({
      "GET /api/me": ok({
        user: {
          id: "usr_1", email: "a@b.co", name: "Ada Lovelace", initials: "AL",
          avatar_url: "avatars/usr_1/avatar.png", deletion_scheduled_for: null,
          preferred_language: "en", ui_theme: "dark", ui_mode: "system",
          created_at: 1700000000, email_verified_at: 1700000001, has_password: false,
          workspace_count: 2, tour_completed: true,
        },
      }),
    });
    const { user } = await new MeResource(api.http()).profile();
    expect(api.calls[0].method).toBe("GET");
    expect(user).toEqual({
      id: "usr_1", email: "a@b.co", name: "Ada Lovelace", initials: "AL",
      avatarUrl: "avatars/usr_1/avatar.png", deletionScheduledFor: null,
      preferredLanguage: "en", uiTheme: "dark", uiMode: "system",
      createdAt: 1700000000, emailVerifiedAt: 1700000001, hasPassword: false,
      workspaceCount: 2, tourCompleted: true,
    });
  });

  it("permissions() sends workspace_id and keeps permission keys snake_case", async () => {
    const api = mockApi({
      "GET /api/me/permissions": ok({
        user_id: "usr_1", role_id: "role_admin", role_name: "Admin", is_builtin: true,
        root_folder_id: null, root_folder_name: null,
        permissions: { upload_files: true, manage_settings: false },
      }),
    });
    const res = await new MeResource(api.http()).permissions("ws_1");
    expect(api.calls[0].method).toBe("GET");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    expect(res).toEqual({
      userId: "usr_1", roleId: "role_admin", roleName: "Admin", isBuiltin: true,
      rootFolderId: null, rootFolderName: null,
      permissions: { upload_files: true, manage_settings: false },
    });
  });

  it("updateName() PUTs {name} and returns the stored name", async () => {
    const api = mockApi({ "PUT /api/me/name": ok({ name: "Ada" }) });
    const res = await new MeResource(api.http()).updateName("Ada");
    expect(api.calls[0].method).toBe("PUT");
    expect(api.calls[0].body).toEqual({ name: "Ada" });
    expect(res).toEqual({ name: "Ada" });
  });

  it("updateName() surfaces the validation error", async () => {
    const api = mockApi({ "PUT /api/me/name": fail(400, "Name is required") });
    await expect(new MeResource(api.http()).updateName(" ")).rejects.toMatchObject({
      status: 400, errorMessage: "Name is required",
    });
  });

  it("revokeCurrentKey() DELETEs /api/me/api-keys/current and resolves void", async () => {
    const api = mockApi({ "DELETE /api/me/api-keys/current": ok() });
    await expect(new MeResource(api.http()).revokeCurrentKey()).resolves.toBeUndefined();
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].method).toBe("DELETE");
    expect(api.calls[0].path).toBe("/api/me/api-keys/current");
  });

  it("revokeCurrentKey() is never retried, even on a 503", async () => {
    const api = mockApi({ "DELETE /api/me/api-keys/current": [fail(503, "Service temporarily unavailable"), ok()] });
    const http = api.http({ retry: { maxRetries: 3, baseDelay: 1, maxDelay: 50 } });
    await expect(new MeResource(http).revokeCurrentKey()).rejects.toBeInstanceOf(DosyaApiError);
    expect(api.calls).toHaveLength(1);
  });

  it("no longer exposes the session-only api-key methods", () => {
    const me = new MeResource(mockApi().http()) as unknown as Record<string, unknown>;
    expect(me.listApiKeys).toBeUndefined();
    expect(me.createApiKey).toBeUndefined();
    expect(me.deleteApiKey).toBeUndefined();
  });
});
