import { describe, it, expect } from "vitest";
import { CommentsResource } from "../../src/resources/comments.js";
import { mockApi, ok } from "./_mock.js";

const row = {
  id: "cmt_1", file_id: "f1", folder_id: null, workspace_id: "ws_1", user_id: "u1", parent_id: null,
  body: "hi", is_edited: 0, created_at: 1, updated_at: 1, user_name: "U", user_email: "u@x.y", user_avatar: null,
};
const camel = {
  id: "cmt_1", fileId: "f1", folderId: null, workspaceId: "ws_1", userId: "u1", parentId: null,
  body: "hi", isEdited: 0, createdAt: 1, updatedAt: 1, userName: "U", userEmail: "u@x.y", userAvatar: null,
};

describe("comments", () => {
  it("list sends file_id and camelCases rows", async () => {
    const api = mockApi({ "GET /api/comments": ok({ comments: [row] }) });
    const comments = new CommentsResource(api.http());
    const res = await comments.list({ workspaceId: "ws_1", fileId: "f1" });
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1", file_id: "f1" });
    expect(res.comments[0]).toEqual(camel);
  });

  it("list by folder", async () => {
    const api = mockApi({ "GET /api/comments": ok({ comments: [] }) });
    await new CommentsResource(api.http()).list({ workspaceId: "ws_1", folderId: "fld_1" });
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1", folder_id: "fld_1" });
  });

  it("list requires fileId or folderId at the type level", () => {
    const comments = new CommentsResource(mockApi().http());
    // @ts-expect-error one of fileId / folderId is required
    void (() => comments.list({ workspaceId: "ws_1" }));
    expect(true).toBe(true);
  });

  it("create POSTs only the allowed keys", async () => {
    const api = mockApi({ "POST /api/comments": ok({ comment: { ...row, parent_id: "cmt_0" } }, 201) });
    const res = await new CommentsResource(api.http()).create({ workspaceId: "ws_1", fileId: "f1", parentId: "cmt_0", body: "hi" });
    expect(api.calls[0].body).toEqual({ workspace_id: "ws_1", file_id: "f1", parent_id: "cmt_0", body: "hi" });
    expect(res.comment.parentId).toBe("cmt_0");
  });

  it("edit PUTs body to the encoded id", async () => {
    const api = mockApi({ "PUT /api/comments/cmt%201": ok({ body: "new", updated_at: 7 }) });
    const res = await new CommentsResource(api.http()).edit("cmt 1", "new");
    expect(api.calls[0].path).toBe("/api/comments/cmt%201");
    expect(api.calls[0].body).toEqual({ body: "new" });
    expect(res).toEqual({ body: "new", updatedAt: 7 });
  });

  it("delete sends DELETE", async () => {
    const api = mockApi({ "DELETE /api/comments/cmt_1": ok() });
    await expect(new CommentsResource(api.http()).delete("cmt_1")).resolves.toBeUndefined();
    expect(api.calls[0].method).toBe("DELETE");
  });
});
