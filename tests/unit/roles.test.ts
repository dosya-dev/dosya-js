import { describe, it, expect } from "vitest";
import { mockApi, ok } from "./_mock.js";
import { RolesResource } from "../../src/resources/roles.js";

describe("RolesResource", () => {
  it("list() keeps permission names snake_case", async () => {
    const api = mockApi({
      "GET /api/roles": ok({
        roles: [
          {
            id: "role_admin",
            name: "Admin",
            is_builtin: true,
            is_custom: false,
            permissions: { upload_files: true, manage_roles: false },
            allowed_ips: null,
            active_hours: null,
            requests_per_minute: null,
            egress_bytes_per_day: null,
            max_file_size_bytes: null,
            max_concurrent_transfers: null,
          },
        ],
        all_permissions: ["upload_files", "manage_roles"],
      }),
    });
    const res = await new RolesResource(api.http()).list("ws_1");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    expect(res.roles[0].isBuiltin).toBe(true);
    expect(res.roles[0].permissions).toEqual({ upload_files: true, manage_roles: false });
    expect(res.roles[0].maxConcurrentTransfers).toBeNull();
    expect(res.allPermissions).toEqual(["upload_files", "manage_roles"]);
  });

  it("create() sends snake_case fields but leaves permission names and active hours intact", async () => {
    const api = mockApi({ "POST /api/roles": ok({ role_id: "role_x" }, 201) });
    const res = await new RolesResource(api.http()).create({
      workspaceId: "ws_1",
      name: "Auditor",
      permissions: { view_all_shares: true },
      allowedIps: "10.0.0.0/8",
      activeHours: { tz: "UTC", days: [1, 2], from: "09:00", to: "17:00" },
      requestsPerMinute: 60,
    });
    expect(api.calls[0].body).toEqual({
      workspace_id: "ws_1",
      name: "Auditor",
      permissions: { view_all_shares: true },
      allowed_ips: "10.0.0.0/8",
      active_hours: { tz: "UTC", days: [1, 2], from: "09:00", to: "17:00" },
      requests_per_minute: 60,
    });
    expect(res).toEqual({ roleId: "role_x" });
  });

  it("update() PUTs only given fields, keeping null clears", async () => {
    const api = mockApi({ "PUT /api/roles/role%2Fx": ok() });
    await new RolesResource(api.http()).update("role/x", { name: "Renamed", egressBytesPerDay: null });
    expect(api.calls[0].path).toBe("/api/roles/role%2Fx");
    expect(api.calls[0].body).toEqual({ name: "Renamed", egress_bytes_per_day: null });
  });

  it("delete() DELETEs the role", async () => {
    const api = mockApi({ "DELETE /api/roles/role_x": ok() });
    await new RolesResource(api.http()).delete("role_x");
    expect(api.calls[0].method).toBe("DELETE");
  });
});
