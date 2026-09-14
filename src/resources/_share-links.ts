import { seg, type HttpClient } from "../http.js";
import type {
  CreateShareLinkParams,
  CreatedShareLink,
  ItemShareLink,
  ShareByEmailParams,
  ShareByEmailResult,
} from "../types.js";

/**
 * Share-link calls that exist identically for files and folders
 * (`/api/files/:id/share*` and `/api/folders/:id/share*`).
 *
 * The two create routes take opposite recipient contracts and refuse the other
 * one's fields with a 400, so each builds its body from an explicit allowlist
 * rather than spreading caller params.
 */
export type ShareableKind = "files" | "folders";

export function listItemShareLinks(
  http: HttpClient,
  kind: ShareableKind,
  id: string,
): Promise<{ links: ItemShareLink[]; excludedCount?: number }> {
  return http.request({ method: "GET", path: `/api/${kind}/${seg(id)}/share` });
}

export function createItemShareLink(
  http: HttpClient,
  kind: ShareableKind,
  id: string,
  params: CreateShareLinkParams = {},
): Promise<{ link: CreatedShareLink }> {
  return http.request({
    method: "POST",
    path: `/api/${kind}/${seg(id)}/share`,
    body: {
      expiresInDays: params.expiresInDays,
      expiresAt: params.expiresAt,
      password: params.password,
      lockMode: params.lockMode,
      accessMode: params.accessMode,
      recipientEmails: params.recipientEmails,
      maxDownloads: params.maxDownloads,
    },
  });
}

export function shareItemByEmail(
  http: HttpClient,
  kind: ShareableKind,
  id: string,
  params: ShareByEmailParams,
): Promise<ShareByEmailResult> {
  return http.request({
    method: "POST",
    path: `/api/${kind}/${seg(id)}/share-email`,
    body: {
      emails: params.emails,
      message: params.message,
      password: params.password,
      expiresInDays: params.expiresInDays,
      expiresAt: params.expiresAt,
      restrictToRecipients: params.restrictToRecipients,
    },
  });
}
