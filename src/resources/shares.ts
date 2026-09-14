import { seg, type HttpClient } from "../http.js";
import type {
  ShareAnalytics,
  ShareAnalyticsParams,
  SharedWithMeResponse,
  SharesListResponse,
  UpdateShareLinkParams,
  UpdatedShareLink,
} from "../types/shares.js";

/**
 * Share links across a workspace. Create links with `files.createShareLink()` /
 * `folders.createShareLink()`.
 *
 * Key scope: GET needs `read` or `full`, the rest `full`; `upload` keys cannot
 * call these. Workspace-pinned keys can only call `list()` (for their own
 * workspace); the by-link-id methods and `withMe()` are refused for them (403).
 */
export class SharesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Up to 100 links in a workspace, newest first, with totals. Needs
   * `access_shared` plus `view_all_shares` (or `view_own_shares`, which lists
   * only the caller's links).
   */
  async list(workspaceId: string): Promise<SharesListResponse> {
    return this.http.request({ method: "GET", path: "/api/shares", query: { workspaceId } });
  }

  /**
   * Change a live link in place; its URL keeps working. Only the fields given
   * change, and `recipientEmails` replaces the whole list. The creator may edit;
   * anyone else needs `view_all_shares`. 409 when revoked. Invalid values
   * (empty patch, short password, bad expiry, download cap or recipients) are a
   * 400 whose `errorMessage` explains the problem; no `code` is sent. Free-plan links
   * are clamped to 7 days. dosya.dev recipient addresses are refused unless the
   * caller is a dosya.dev account.
   */
  async update(linkId: string, params: UpdateShareLinkParams): Promise<{ link: UpdatedShareLink }> {
    return this.http.request({
      method: "PATCH",
      path: `/api/shares/${seg(linkId)}`,
      body: {
        expiresAt: params.expiresAt,
        expiresInDays: params.expiresInDays,
        password: params.password,
        lockMode: params.lockMode,
        accessMode: params.accessMode,
        recipientEmails: params.recipientEmails,
        maxDownloads: params.maxDownloads,
      },
    });
  }

  /**
   * Per-link analytics: daily opens and downloads, device and browser reach,
   * recipients (restricted links) and a 25-row access log page. Needs
   * `view_all_shares`, or `view_own_shares` for the caller's own links.
   * 400 for a range other than 7, 30 or 90.
   */
  async analytics(linkId: string, params: ShareAnalyticsParams = {}): Promise<ShareAnalytics> {
    return this.http.request({
      method: "GET",
      path: `/api/shares/${seg(linkId)}/analytics`,
      query: { range: params.range, offset: params.offset },
    });
  }

  /**
   * Revoke a link permanently. The creator may revoke; anyone else needs
   * `view_all_shares`. 409 when already revoked.
   */
  async revoke(linkId: string): Promise<void> {
    await this.http.request({ method: "POST", path: `/api/shares/${seg(linkId)}/revoke` });
  }

  /** Links other people shared with the caller's verified email address (up to 100). */
  async withMe(): Promise<SharedWithMeResponse> {
    return this.http.request({ method: "GET", path: "/api/shares/with-me" });
  }
}
