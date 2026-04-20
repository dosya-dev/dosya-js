import type { HttpClient } from "../http.js";
import type { CreateFileRequestParams, FileRequestDetail } from "../types.js";

export class FileRequestsResource {
  constructor(private readonly http: HttpClient) {}

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

  async get(requestId: string): Promise<{ request: FileRequestDetail }> {
    return this.http.request({
      method: "GET",
      path: `/api/file-requests/${requestId}`,
    });
  }

  async update(
    requestId: string,
    params: { title?: string; message?: string },
  ): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: `/api/file-requests/${requestId}`,
      body: { title: params.title, message: params.message },
    });
  }

  async delete(requestId: string): Promise<void> {
    await this.http.request({
      method: "DELETE",
      path: `/api/file-requests/${requestId}`,
    });
  }

  async listUploads(requestId: string): Promise<{
    uploads: Array<{
      id: string;
      fileName: string;
      sizeBytes: number;
      mimeType: string;
      uploadedAt: number;
      uploaderEmail: string | null;
    }>;
  }> {
    return this.http.request({
      method: "GET",
      path: `/api/file-requests/${requestId}/uploads`,
    });
  }

  async listRecipients(requestId: string): Promise<{
    recipients: Array<{
      id: string;
      email: string;
      status: string;
      sentAt: number;
    }>;
  }> {
    return this.http.request({
      method: "GET",
      path: `/api/file-requests/${requestId}/recipients`,
    });
  }

  async resend(
    requestId: string,
    recipientIds?: string[],
  ): Promise<void> {
    await this.http.request({
      method: "POST",
      path: `/api/file-requests/${requestId}/resend`,
      body: { recipientIds },
    });
  }
}
