/** When a role may use the workspace, e.g. `{tz: "Europe/Berlin", days: [1,2,3,4,5], from: "09:00", to: "17:00"}`. */
export interface ActiveHours {
  /** IANA time zone. */
  tz: string;
  /** Weekdays, 0 = Sunday. */
  days: number[];
  /** `HH:MM`. */
  from: string;
  /** `HH:MM`. */
  to: string;
}

export interface Role {
  /** `role_owner`, `role_admin`, `role_member`, `role_viewer`, or a custom role id. */
  id: string;
  name: string;
  isBuiltin: boolean;
  isCustom: boolean;
  /** Every permission name (snake_case, e.g. `upload_files`) to whether it is granted. */
  permissions: Record<string, boolean>;
  /** Comma-separated IPs/CIDRs, or null. Always null on built-in roles. */
  allowedIps: string | null;
  /** JSON text of an `ActiveHours` object, or null. */
  activeHours: string | null;
  requestsPerMinute: number | null;
  egressBytesPerDay: number | null;
  maxFileSizeBytes: number | null;
  maxConcurrentTransfers: number | null;
}

export interface RolesListResponse {
  /** Built-in roles first, then custom roles by name. */
  roles: Role[];
  /** Every permission name the API knows. */
  allPermissions: string[];
}

/** Fields shared by role create and update. `null` or `""` clears a condition or limit. */
export interface RoleFields {
  /** 1-50 characters. */
  name?: string;
  /** Permission name (snake_case) to granted. Unknown names are ignored. */
  permissions?: Record<string, boolean>;
  /** Comma-separated IPs/CIDRs. */
  allowedIps?: string | null;
  activeHours?: ActiveHours | null;
  /** Positive integers. */
  requestsPerMinute?: number | null;
  egressBytesPerDay?: number | null;
  maxFileSizeBytes?: number | null;
  maxConcurrentTransfers?: number | null;
}

export interface CreateRoleParams extends RoleFields {
  workspaceId: string;
  name: string;
}

export type UpdateRoleParams = RoleFields;
