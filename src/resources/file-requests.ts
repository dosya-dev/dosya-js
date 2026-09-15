import { seg, type HttpClient } from "../http.js";
import type {
  CreateFileRequestParams,
  FileRequestListItem,
  FileRequestRecipient,
  FileRequestWithActivity,
  UpdateFileRequestParams,
} from "../types/file-requests.js";

/**
 * Upload requests: public pages where anyone with the link can upload into a
 * workspace folder.
 *
 * Key scope: GET needs `read` or `full`, the rest `full`; `upload` keys cannot
 * call these. Workspace-pinned keys can only call `list()` (for their own
 * workspace); every other method is refused for them (403). dosya.dev recipient
 * addresses are refused (400) unless the caller is a dosya.dev account.
 */
export class FileRequestsResource {
  constructor(private readonly http: HttpClient) {}

  /** Every request in a workspace (a confined member sees only their folder's). */
  async list(workspaceId: string): Promise<{ requests: FileRequestListItem[] }> {
    return this.http.request({ method: "GET", path: "/api/file-requests", query: { workspaceId } });
  }

  /**
   * Create a request and email it to `emails`. 404 when the folder is missing or
   * hidden, 403 `folder_locked` when it is fully locked.
   */
  async create(params: CreateFileRequestParams): Promise<{
    request: {
      id: string;
      token: string;
      url: string;
      title: string | null;
      expiresAt: number | null;
    };
  }> {
    return this.http.request({
      method: "POST",
      path: "/api/file-requests/create",
      body: {
        workspaceId: params.workspaceId,
        folderId: params.folderId,
        title: params.title,
        message: params.message,
        password: params.password,
        expiresInDays: params.expiresInDays,
        allowedExtensions: params.allowedExtensions,
        maxFileSizeMb: params.maxFileSizeMb,
        maxFiles: params.maxFiles,
        emails: params.emails,
      },
    });
  }

  /** One request with its uploads and recipients. 404 when unknown. */
  async get(requestId: string): Promise<FileRequestWithActivity> {
    return this.http.request({ method: "GET", path: `/api/file-requests/${seg(requestId)}/uploads` });
  }

  /**
   * Edit a request; only the fields given change. 400 "Nothing to update" for an
   * empty patch, 403 `folder_locked` when moving into a locked folder.
   */
  async update(requestId: string, params: UpdateFileRequestParams): Promise<void> {
    // A blank password would be read as "remove the password" and silently make
    // the upload page public; `""` is the explicit way to do that.
    if (typeof params.password === "string" && params.password !== "" && params.password.trim() === "") {
      throw new TypeError('Password must not be blank; pass "" to remove it');
    }
    await this.http.request({
      method: "PATCH",
      path: `/api/file-requests/${seg(requestId)}`,
      body: {
        title: params.title,
        message: params.message,
        expiresInDays: params.expiresInDays,
        password: params.password,
        folderId: params.folderId,
        allowedExtensions: params.allowedExtensions,
        maxFileSizeMb: params.maxFileSizeMb,
        maxFiles: params.maxFiles,
      },
    });
  }

  /** Revoke a request (its page stops accepting uploads) and notify recipients. */
  async delete(requestId: string): Promise<void> {
    // Not retried: a repeated DELETE notifies every recipient again.
    await this.http.request({ method: "DELETE", path: `/api/file-requests/${seg(requestId)}`, retry: "never" });
  }

  /** Files uploaded through a request, with the request and its recipients. */
  async listUploads(requestId: string): Promise<FileRequestWithActivity> {
    return this.get(requestId);
  }

  /** Invited addresses, oldest first, with their personal upload tokens. */
  async listRecipients(requestId: string): Promise<{
    recipients: FileRequestRecipient[];
    title: string | null;
    requestToken: string;
  }> {
    return this.http.request({ method: "GET", path: `/api/file-requests/${seg(requestId)}/recipients` });
  }

  /**
   * Invite one more address and email it. 409 when already a recipient, 410 when
   * the request is revoked.
   */
  async addRecipient(requestId: string, email: string): Promise<{ id: string }> {
    return this.http.request({
      method: "POST",
      path: `/api/file-requests/${seg(requestId)}/recipients`,
      body: { email },
    });
  }

  /** Remove a recipient. Succeeds when already gone. */
  async removeRecipient(requestId: string, recipientId: string): Promise<void> {
    seg(recipientId); // validates: an empty id would otherwise be dropped from the query
    await this.http.request({
      method: "DELETE",
      path: `/api/file-requests/${seg(requestId)}/recipients`,
      query: { recipientId },
    });
  }

  /**
   * Email the request to one recipient again. 404 when the request is revoked or
   * the recipient unknown; 500 when the email could not be sent.
   */
  async resend(requestId: string, recipientId: string): Promise<void> {
    await this.http.request({
      method: "POST",
      path: `/api/file-requests/${seg(requestId)}/resend`,
      body: { recipientId },
    });
  }
}
