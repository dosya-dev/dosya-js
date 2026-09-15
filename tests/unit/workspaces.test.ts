import { describe, it, expect } from "vitest";
import { mockApi, ok, fail } from "./_mock.js";
import { WorkspacesResource } from "../../src/resources/workspaces.js";
import { DosyaApiError } from "../../src/errors.js";

const storage = {
  used: 10,
  total: 100,
  free: 90,
  cap_bytes: null,
  account_limit_bytes: 100,
  account_used_bytes: 10,
};

describe("WorkspacesResource", () => {
  it("list() returns rows with storage, 2fa keys and the top-level account fields", async () => {
    const api = mockApi({
      "GET /api/workspaces": ok({
        workspaces: [
          {
            id: "ws_1",
            name: "Team",
            slug: "team",
            icon_initials: "TE",
            icon_color: "#000",
            icon_image_url: null,
            owner_id: "usr_1",
            default_region: "eu-central-1",
            plan: "pro",
            created_at: 1,
            storage_used_bytes: 10,
            role_id: "role_owner",
            joined_at: 2,
            require_2fa: 1,
            disable_password_login: 0,
            max_total_storage_gb: null,
            storage,
          },
        ],
        allocation: { plan_gb: 500, allocated_gb: 0, remaining_gb: 500 },
        user_email: "a@b.c",
        user_has_2fa: true,
        user_login_method: "password",
      }),
    });
    const res = await new WorkspacesResource(api.http()).list();
    expect(api.calls[0].method).toBe("GET");
    const ws = res.workspaces[0];
    expect(ws.defaultRegion).toBe("eu-central-1");
    expect(ws.iconImageUrl).toBeNull();
    expect(ws.require2fa).toBe(1);
    expect(ws.joinedAt).toBe(2);
    expect(ws.storage.accountLimitBytes).toBe(100);
    expect(res.allocation.remainingGb).toBe(500);
    expect(res.userHas2fa).toBe(true);
    expect(res.userEmail).toBe("a@b.c");
    expect(res.userLoginMethod).toBe("password");
  });

  it("get() encodes the id and returns plan, storage, planLimits and allocation", async () => {
    const api = mockApi({
      "GET /api/workspaces/ws%2F1": ok({
        workspace: { id: "ws/1", icon_image_url: "icons/x", default_region: "us-east-1" },
        settings: { workspace_id: "ws/1", require_2fa: 1, default_share_expiry_days: 7 },
        role_id: "role_admin",
        is_owner: false,
        plan: "free",
        storage,
        plan_limits: { storage_gb: 5 },
        allocation: { plan_gb: 5, allocated_gb: 1, remaining_gb: 4 },
      }),
    });
    const res = await new WorkspacesResource(api.http()).get("ws/1");
    expect(api.calls[0].path).toBe("/api/workspaces/ws%2F1");
    expect(res.workspace.iconImageUrl).toBe("icons/x");
    expect(res.workspace.defaultRegion).toBe("us-east-1");
    expect(res.settings?.require2fa).toBe(1);
    expect(res.settings?.defaultShareExpiryDays).toBe(7);
    expect(res.roleId).toBe("role_admin");
    expect(res.planLimits.storageGb).toBe(5);
    expect(res.allocation.allocatedGb).toBe(1);
    expect(res.storage.free).toBe(90);
  });

  it("get() rejects an empty id before any request", async () => {
    const api = mockApi();
    await expect(new WorkspacesResource(api.http()).get("")).rejects.toThrow(TypeError);
    expect(api.calls).toHaveLength(0);
  });

  it("create() sends the allowlisted body incl. region and cap", async () => {
    const api = mockApi({
      "POST /api/workspaces": ok(
        { workspace: { id: "ws_2", slug: "new-ws_2", name: "New", icon_initials: "NE", icon_color: "#fff" } },
        201,
      ),
    });
    const res = await new WorkspacesResource(api.http()).create({
      name: "New",
      iconInitials: "NE",
      defaultRegion: "ap-southeast-2",
      maxTotalStorageGb: 10,
    });
    expect(api.calls[0].body).toEqual({
      name: "New",
      icon_initials: "NE",
      default_region: "ap-southeast-2",
      max_total_storage_gb: 10,
    });
    expect(res.workspace).toEqual({ id: "ws_2", slug: "new-ws_2", name: "New", iconInitials: "NE", iconColor: "#fff" });
  });

  it("update() never sends default_region (regression: API answers 409)", async () => {
    const api = mockApi({ "PUT /api/workspaces/ws_1": ok() });
    // A 0.1-style caller passing defaultRegion must not trip the 409.
    await new WorkspacesResource(api.http()).update("ws_1", {
      name: "Renamed",
      defaultRegion: "us-east-1",
    } as never);
    expect(api.calls[0].method).toBe("PUT");
    expect(api.calls[0].body).toEqual({ name: "Renamed" });
  });

  it("getSettings() reads the lightweight share settings", async () => {
    const api = mockApi({
      "GET /api/workspaces/ws_1/settings": ok({
        settings: { default_share_expiry_days: 30, share_max_expiry_days: null, disable_share_links: 0, force_share_password: 1 },
      }),
    });
    const res = await new WorkspacesResource(api.http()).getSettings("ws_1");
    expect(res.settings).toEqual({
      defaultShareExpiryDays: 30,
      shareMaxExpiryDays: null,
      disableShareLinks: 0,
      forceSharePassword: 1,
    });
  });

  it("updateSettings() sends require_2fa (regression: key never reached the API)", async () => {
    const api = mockApi({ "PUT /api/workspaces/ws_1/settings": ok() });
    await new WorkspacesResource(api.http()).updateSettings("ws_1", { require2fa: true });
    expect(api.calls[0].body).toEqual({ require_2fa: true });
  });

  it("updateSettings() allowlists fields, keeps null, and JSON-encodes list settings", async () => {
    const api = mockApi({ "PUT /api/workspaces/ws_1/settings": ok() });
    await new WorkspacesResource(api.http()).updateSettings("ws_1", {
      maxFileSizeGb: null,
      defaultShareExpiryDays: 14,
      duplicateScanEnabled: false,
      allowedExtensions: ".pdf",
      ipAllowlist: ["10.0.0.0/8"],
      allowedEmailDomains: null,
      countryBlocklist: undefined,
      bogus: 1,
    } as never);
    expect(api.calls[0].body).toEqual({
      max_file_size_gb: null,
      default_share_expiry_days: 14,
      duplicate_scan_enabled: false,
      allowed_extensions: ".pdf",
      ip_allowlist: '["10.0.0.0/8"]',
      allowed_email_domains: null,
    });
  });

  it("uploadLimits() returns the camelCased limits", async () => {
    const api = mockApi({
      "GET /api/workspaces/ws_1/upload-limits": ok({
        allowed_extensions: null,
        blocked_extensions: ".exe",
        max_file_size_gb: 2,
        storage_remaining_bytes: 1000,
        max_concurrent_uploads: 5,
      }),
    });
    const res = await new WorkspacesResource(api.http()).uploadLimits("ws_1");
    expect(res).toEqual({
      allowedExtensions: null,
      blockedExtensions: ".exe",
      maxFileSizeGb: 2,
      storageRemainingBytes: 1000,
      maxConcurrentUploads: 5,
    });
  });

  it("deletePreview() returns counts and blockers", async () => {
    const api = mockApi({
      "GET /api/workspaces/ws_1/delete-preview": ok({
        workspace_id: "ws_1",
        workspace_name: "Team",
        file_count: 3,
        total_bytes: 30,
        folder_count: 1,
        member_count: 2,
        blockers: ["has_members"],
      }),
    });
    const res = await new WorkspacesResource(api.http()).deletePreview("ws_1");
    expect(res.workspaceName).toBe("Team");
    expect(res.memberCount).toBe(2);
    expect(res.blockers).toEqual(["has_members"]);
  });

  it("requestDeletion() POSTs delete-request and returns expiresAt/sentTo", async () => {
    const api = mockApi({ "POST /api/workspaces/ws_1/delete-request": ok({ expires_at: 900, sent_to: "o@x.y" }) });
    const res = await new WorkspacesResource(api.http()).requestDeletion("ws_1");
    expect(api.calls[0].method).toBe("POST");
    expect(res).toEqual({ expiresAt: 900, sentTo: "o@x.y" });
  });

  it("delete() sends {code, confirm_name} (regression: body was missing)", async () => {
    const api = mockApi({ "DELETE /api/workspaces/ws_1": ok() });
    const res = await new WorkspacesResource(api.http()).delete("ws_1", { code: "123456", confirmName: "Team" });
    expect(api.calls[0].method).toBe("DELETE");
    expect(api.calls[0].body).toEqual({ code: "123456", confirm_name: "Team" });
    expect(res).toEqual({});
  });

  it("delete() surfaces a pending 202 deletion", async () => {
    const api = mockApi({ "DELETE /api/workspaces/ws_1": ok({ pending: true, operation_id: "op_1" }, 202) });
    const res = await new WorkspacesResource(api.http()).delete("ws_1", { code: "123456", confirmName: "Team" });
    expect(res).toEqual({ pending: true, operationId: "op_1" });
  });

  it("delete() does not replay a failed attempt", async () => {
    const api = mockApi({ "DELETE /api/workspaces/ws_1": fail(500, "Failed to delete workspace. Please try again.") });
    await expect(
      new WorkspacesResource(api.http({ retry: { maxRetries: 3, baseDelay: 1, maxDelay: 5 } })).delete("ws_1", {
        code: "123456",
        confirmName: "Team",
      }),
    ).rejects.toBeInstanceOf(DosyaApiError);
    expect(api.calls).toHaveLength(1);
  });

  it("transfer() sends user_id", async () => {
    const api = mockApi({ "POST /api/workspaces/ws_1/transfer": ok() });
    await new WorkspacesResource(api.http()).transfer("ws_1", "usr_2");
    expect(api.calls[0].body).toEqual({ user_id: "usr_2" });
  });

  it("leave() POSTs to leave", async () => {
    const api = mockApi({ "POST /api/workspaces/ws_1/leave": ok() });
    await new WorkspacesResource(api.http()).leave("ws_1");
    expect(api.calls[0].method).toBe("POST");
    expect(api.calls[0].path).toBe("/api/workspaces/ws_1/leave");
  });
});
