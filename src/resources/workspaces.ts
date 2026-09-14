import { seg, type HttpClient } from "../http.js";
import type {
  CreateWorkspaceParams,
  DeleteWorkspaceParams,
  DeleteWorkspaceResult,
  UpdateWorkspaceParams,
  WorkspaceDeletePreview,
  WorkspaceDeletionRequest,
  WorkspaceDetailResponse,
  WorkspaceListResponse,
  WorkspaceSettingsUpdate,
  WorkspaceShareSettings,
  WorkspaceUploadLimits,
} from "../types/workspaces.js";

/** Settings stored as JSON array text; arrays are encoded before sending. */
const JSON_LIST_SETTINGS = [
  "ipAllowlist",
  "ipBlocklist",
  "countryAllowlist",
  "countryBlocklist",
  "allowedEmailDomains",
] as const;

const SETTINGS_FIELDS: ReadonlyArray<keyof WorkspaceSettingsUpdate> = [
  "maxFileSizeGb",
  "maxStoragePerMemberGb",
  "maxTotalStorageGb",
  "maxConcurrentUploads",
  "sessionTimeoutMinutes",
  "shareMaxExpiryDays",
  "defaultShareExpiryDays",
  "downloadRateLimit",
  "notifyOnUpload",
  "autoShareLink",
  "downloadTracking",
  "disableShareLinks",
  "forceSharePassword",
  "require2fa",
  "disablePasswordLogin",
  "recordUploadOrigin",
  "duplicateScanEnabled",
  "allowedExtensions",
  "blockedExtensions",
  ...JSON_LIST_SETTINGS,
];

/**
 * Workspaces.
 *
 * Key scope: GET needs a `read` or `full` key, everything else `full`; `upload`
 * keys cannot call any of these. A workspace-pinned key only reaches its own
 * workspace and cannot create new ones.
 */
export class WorkspacesResource {
  constructor(private readonly http: HttpClient) {}

  /** Every workspace the caller belongs to, with storage figures. A pinned key sees one row. */
  async list(): Promise<WorkspaceListResponse> {
    return this.http.request({ method: "GET", path: "/api/workspaces" });
  }

  /**
   * One workspace, its full settings row, the caller's role and storage.
   * 403 when the caller is not a member.
   */
  async get(workspaceId: string): Promise<WorkspaceDetailResponse> {
    return this.http.request({ method: "GET", path: `/api/workspaces/${seg(workspaceId)}` });
  }

  /**
   * Create a workspace owned by the caller.
   *
   * `defaultRegion` is fixed for the life of the workspace; list valid codes with
   * `regions.list()` (400 "Unknown location" otherwise). The free plan allows 3
   * owned workspaces (403). `maxTotalStorageGb` must fit the owner's unallocated
   * plan storage (400). Refused for workspace-pinned keys.
   */
  async create(params: CreateWorkspaceParams): Promise<{
    workspace: { id: string; slug: string; name: string; iconInitials: string; iconColor: string };
  }> {
    return this.http.request({
      method: "POST",
      path: "/api/workspaces",
      body: {
        name: params.name,
        iconInitials: params.iconInitials,
        iconColor: params.iconColor,
        defaultRegion: params.defaultRegion,
        maxTotalStorageGb: params.maxTotalStorageGb,
      },
    });
  }

  /**
   * Rename or re-icon a workspace. Needs `access_settings` plus
   * `change_workspace_name` / `change_workspace_icon`. 400 when nothing is given.
   * The location cannot be changed.
   */
  async update(workspaceId: string, params: UpdateWorkspaceParams): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: `/api/workspaces/${seg(workspaceId)}`,
      body: {
        name: params.name,
        iconInitials: params.iconInitials,
        iconColor: params.iconColor,
      },
    });
  }

  /**
   * The share defaults any member may read (default and maximum link expiry,
   * whether links are disabled or need a password). `settings` is null when the
   * workspace has no settings row.
   */
  async getSettings(workspaceId: string): Promise<{ settings: WorkspaceShareSettings | null }> {
    return this.http.request({ method: "GET", path: `/api/workspaces/${seg(workspaceId)}/settings` });
  }

  /**
   * Change workspace limits and policies. Only the fields given are written.
   *
   * Needs `access_settings` plus the per-field permission (`change_max_file_size`,
   * `change_total_storage_cap`, ..., `change_duplicate_scan`, or `manage_settings`
   * for the rest). Out-of-range or non-numeric values are a 400 whose
   * `errorMessage` names the problem (no `code` is sent); 400 "Nothing to
   * update" for an empty patch.
   */
  async updateSettings(workspaceId: string, settings: Partial<WorkspaceSettingsUpdate>): Promise<void> {
    const body: Record<string, unknown> = {};
    for (const field of SETTINGS_FIELDS) {
      if (!(field in settings) || settings[field] === undefined) continue;
      const value = settings[field];
      body[field] =
        Array.isArray(value) && (JSON_LIST_SETTINGS as readonly string[]).includes(field)
          ? JSON.stringify(value)
          : value;
    }
    await this.http.request({
      method: "PUT",
      path: `/api/workspaces/${seg(workspaceId)}/settings`,
      body,
    });
  }

  /**
   * What an uploader is judged against: extension rules, file size cap, a storage
   * remaining hint and the concurrent upload limit. Any member.
   */
  async uploadLimits(workspaceId: string): Promise<WorkspaceUploadLimits> {
    return this.http.request({ method: "GET", path: `/api/workspaces/${seg(workspaceId)}/upload-limits` });
  }

  /**
   * What deleting the workspace would destroy, plus the `blockers` that would
   * refuse it (`has_members`, `last_workspace`). Owner only (403).
   */
  async deletePreview(workspaceId: string): Promise<WorkspaceDeletePreview> {
    return this.http.request({ method: "GET", path: `/api/workspaces/${seg(workspaceId)}/delete-preview` });
  }

  /**
   * Step one of deletion: email the owner a 6-digit code, valid 15 minutes.
   * Owner only. 400 when other members remain or it is the owner's last
   * workspace; 429 within 60 s of the previous code or past 5 per hour.
   */
  async requestDeletion(workspaceId: string): Promise<WorkspaceDeletionRequest> {
    return this.http.request({ method: "POST", path: `/api/workspaces/${seg(workspaceId)}/delete-request` });
  }

  /**
   * Step two: delete the workspace with the emailed code and its exact name.
   *
   * By design an API key cannot delete a workspace unattended: someone has to
   * read the code from the owner's inbox. Errors: 400 name mismatch / members
   * remain / last workspace / missing code, 401 wrong or expired code, 429 code
   * burned after 5 attempts, 403 not the owner. Resolves `{pending: true,
   * operationId}` when the deletion continues in the background (HTTP 202).
   */
  async delete(workspaceId: string, params: DeleteWorkspaceParams): Promise<DeleteWorkspaceResult> {
    const result = await this.http.request<DeleteWorkspaceResult>({
      method: "DELETE",
      path: `/api/workspaces/${seg(workspaceId)}`,
      body: { code: params.code, confirmName: params.confirmName },
      // A replay would spend another of the code's five attempts.
      retry: "never",
    });
    return result ?? {};
  }

  /**
   * Make another member the owner. `userId` is their user id (not membership id).
   * The caller becomes an admin. Owner only.
   */
  async transfer(workspaceId: string, userId: string): Promise<void> {
    await this.http.request({
      method: "POST",
      path: `/api/workspaces/${seg(workspaceId)}/transfer`,
      body: { userId },
    });
  }

  /** Leave a workspace. The owner cannot leave (400, transfer ownership first). */
  async leave(workspaceId: string): Promise<void> {
    await this.http.request({ method: "POST", path: `/api/workspaces/${seg(workspaceId)}/leave` });
  }
}
