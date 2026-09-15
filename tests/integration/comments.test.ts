import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getClient, getWorkspaceId, uploadTestFile } from "../helpers.js";
import type { DosyaClient } from "../../src/index.js";

describe("Comments Resource", () => {
  let client: DosyaClient;
  let workspaceId: string;
  let fileId: string;
  let commentId: string;

  beforeAll(async () => {
    client = getClient();
    workspaceId = await getWorkspaceId(client);

    const { result } = await uploadTestFile(client, workspaceId);
    fileId = result.file.id;
  });

  afterAll(async () => {
    if (commentId) {
      try {
        await client.comments.delete(commentId);
      } catch {
        /* already cleaned up */
      }
    }
    if (fileId) {
      try {
        await client.files.delete(fileId);
      } catch {
        /* already cleaned up */
      }
    }
  });

  describe("create()", () => {
    it("should create a comment on a file", async () => {
      const { comment } = await client.comments.create({
        workspaceId,
        fileId,
        body: "Test comment from SDK",
      });

      commentId = comment.id;

      expect(comment.id).toBeTruthy();
      expect(comment.body).toBe("Test comment from SDK");
      expect(comment.userId).toBeTruthy();
      expect(comment.userName).toBeTruthy();
      expect(comment.fileId).toBe(fileId);
      expect(comment.folderId).toBeNull();
      expect(comment.workspaceId).toBe(workspaceId);
      expect(Number(comment.isEdited)).toBe(0);
      expect(comment.parentId).toBeNull();
      expect(typeof comment.createdAt).toBe("number");
    });

    it("should create a reply to an existing comment", async () => {
      const { comment } = await client.comments.create({
        workspaceId,
        fileId,
        parentId: commentId,
        body: "This is a reply",
      });

      expect(comment.id).toBeTruthy();
      expect(comment.parentId).toBe(commentId);
      expect(comment.body).toBe("This is a reply");

      // Clean up the reply
      await client.comments.delete(comment.id);
    });
  });

  describe("list()", () => {
    it("should list comments on a file", async () => {
      const { comments } = await client.comments.list({
        workspaceId,
        fileId,
      });

      expect(Array.isArray(comments)).toBe(true);
      expect(comments.length).toBeGreaterThanOrEqual(1);
    });

    it("should return comments with expected fields", async () => {
      const { comments } = await client.comments.list({
        workspaceId,
        fileId,
      });
      const comment = comments[0];

      expect(comment.id).toBeTruthy();
      expect(comment.body).toBeTruthy();
      expect(comment.userId).toBeTruthy();
      expect(typeof comment.createdAt).toBe("number");
    });
  });

  describe("edit()", () => {
    it("should edit a comment body", async () => {
      const result = await client.comments.edit(
        commentId,
        "Updated comment body",
      );

      expect(result.body).toBe("Updated comment body");
      expect(typeof result.updatedAt).toBe("number");
    });

    it("should reflect changes when listing", async () => {
      const { comments } = await client.comments.list({
        workspaceId,
        fileId,
      });
      const updated = comments.find((c) => c.id === commentId);
      expect(updated?.body).toBe("Updated comment body");
      expect(Number(updated?.isEdited)).toBe(1);
    });
  });

  describe("delete()", () => {
    it("should delete a comment", async () => {
      // Create a throwaway comment
      const { comment } = await client.comments.create({
        workspaceId,
        fileId,
        body: "To be deleted",
      });

      await expect(
        client.comments.delete(comment.id),
      ).resolves.toBeUndefined();
    });
  });
});
