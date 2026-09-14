import { describe, it, expect } from "vitest";
import { mockApi, ok } from "./_mock.js";
import { FileRequestsResource } from "../../src/resources/file-requests.js";

const detailPayload = {
  request: {
    id: "fr_1",
    workspace_id: "ws_1",
    folder_id: null,
    token: "tok",
    title: "Docs",
    message: null,
    is_revoked: 0,
    is_password_protected: 1,
    expires_at: null,
    allowed_extensions: ".pdf",
    max_file_size_bytes: null,
    max_files: 3,
    upload_count: 1,
    created_at: 10,
    created_by_name: "A",
    folder_name: null,
    url: "https://dosya.dev/upload-request/tok",
  },
  uploads: [
    {
      id: "fru_1",
      file_id: "f_1",
      uploader_email: "g@x.y",
      uploader_name: null,
      created_at: 20,
      file_name: "a.pdf",
      size_bytes: 5,
      mime_type: "application/pdf",
      extension: "pdf",
      updated_at: 20,
      current_version: 1,
      lock_mode: "none",
      is_hidden: 0,
      uploaded_by: "usr_1",
      region: "ap-southeast-2",
      origin: null,
    },
  ],
  recipients: [{ id: "frr_1", email: "r@x.y", token: "rt", sent_at: null, uploaded_at: null, created_at: 1 }],
  title: "Docs",
};

describe("FileRequestsResource", () => {
  it("list() queries workspace_id", async () => {
    const api = mockApi({
      "GET /api/file-requests": ok({ requests: [{ id: "fr_1", upload_count: 2, created_by_name: "A" }] }),
    });
    const res = await new FileRequestsResource(api.http()).list("ws_1");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    expect(res.requests[0].uploadCount).toBe(2);
    expect(res.requests[0].createdByName).toBe("A");
  });

  it("create() sends the allowlisted body", async () => {
    const api = mockApi({
      "POST /api/file-requests/create": ok({ request: { id: "fr_1", token: "t", url: "u", title: "T", expires_at: null } }, 201),
    });
    const res = await new FileRequestsResource(api.http()).create({
      workspaceId: "ws_1",
      title: "T",
      maxFileSizeMb: 10,
      emails: ["a@x.y"],
    });
    expect(api.calls[0].body).toEqual({ workspace_id: "ws_1", title: "T", max_file_size_mb: 10, emails: ["a@x.y"] });
    expect(res.request.expiresAt).toBeNull();
  });

  it("get() reads /:id/uploads (regression: GET /:id has no handler)", async () => {
    const api = mockApi({ "GET /api/file-requests/fr%2F1/uploads": ok(detailPayload) });
    const res = await new FileRequestsResource(api.http()).get("fr/1");
    expect(api.calls[0].method).toBe("GET");
    expect(api.calls[0].path).toBe("/api/file-requests/fr%2F1/uploads");
    expect(res.request.workspaceId).toBe("ws_1");
    expect(res.request.maxFiles).toBe(3);
    expect(res.uploads[0].createdAt).toBe(20);
    expect(res.recipients[0].sentAt).toBeNull();
  });

  it("update() uses PATCH with the full field set (regression: was PUT)", async () => {
    const api = mockApi({ "PATCH /api/file-requests/fr_1": ok() });
    await new FileRequestsResource(api.http()).update("fr_1", {
      title: "New",
      message: null,
      expiresInDays: null,
      password: "",
      folderId: "fld_1",
      allowedExtensions: ".png",
      maxFileSizeMb: 0,
      maxFiles: 5,
    });
    expect(api.calls[0].method).toBe("PATCH");
    expect(api.calls[0].body).toEqual({
      title: "New",
      message: null,
      expires_in_days: null,
      password: "",
      folder_id: "fld_1",
      allowed_extensions: ".png",
      max_file_size_mb: 0,
      max_files: 5,
    });
  });

  it("update() omits fields that were not given", async () => {
    const api = mockApi({ "PATCH /api/file-requests/fr_1": ok() });
    await new FileRequestsResource(api.http()).update("fr_1", { title: "Only" });
    expect(api.calls[0].body).toEqual({ title: "Only" });
  });

  it("delete() DELETEs the request", async () => {
    const api = mockApi({ "DELETE /api/file-requests/fr_1": ok() });
    await new FileRequestsResource(api.http()).delete("fr_1");
    expect(api.calls[0].method).toBe("DELETE");
  });

  it("listUploads() returns the real upload rows", async () => {
    const api = mockApi({ "GET /api/file-requests/fr_1/uploads": ok(detailPayload) });
    const res = await new FileRequestsResource(api.http()).listUploads("fr_1");
    expect(res.uploads[0]).toMatchObject({ fileId: "f_1", fileName: "a.pdf", uploaderEmail: "g@x.y", region: "ap-southeast-2" });
    expect(res.title).toBe("Docs");
  });

  it("listRecipients() returns rows plus title and requestToken", async () => {
    const api = mockApi({
      "GET /api/file-requests/fr_1/recipients": ok({
        recipients: detailPayload.recipients,
        title: "Docs",
        request_token: "tok",
      }),
    });
    const res = await new FileRequestsResource(api.http()).listRecipients("fr_1");
    expect(res.recipients[0]).toEqual({ id: "frr_1", email: "r@x.y", token: "rt", sentAt: null, uploadedAt: null, createdAt: 1 });
    expect(res.requestToken).toBe("tok");
  });

  it("addRecipient() POSTs the email and returns the id", async () => {
    const api = mockApi({ "POST /api/file-requests/fr_1/recipients": ok({ id: "frr_2" }, 201) });
    const res = await new FileRequestsResource(api.http()).addRecipient("fr_1", "n@x.y");
    expect(api.calls[0].body).toEqual({ email: "n@x.y" });
    expect(res).toEqual({ id: "frr_2" });
  });

  it("removeRecipient() DELETEs with recipient_id in the query", async () => {
    const api = mockApi({ "DELETE /api/file-requests/fr_1/recipients": ok() });
    const fr = new FileRequestsResource(api.http());
    await fr.removeRecipient("fr_1", "frr_1");
    expect(api.calls[0].query).toEqual({ recipient_id: "frr_1" });
    await expect(fr.removeRecipient("fr_1", "")).rejects.toThrow(TypeError);
  });

  it("resend() sends a single recipient_id (regression: sent recipient_ids array)", async () => {
    const api = mockApi({ "POST /api/file-requests/fr_1/resend": ok() });
    await new FileRequestsResource(api.http()).resend("fr_1", "frr_1");
    expect(api.calls[0].body).toEqual({ recipient_id: "frr_1" });
  });
});
