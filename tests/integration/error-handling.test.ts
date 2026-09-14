import { describe, it, expect, beforeAll } from "vitest";
import { DosyaClient, DosyaApiError } from "../../src/index.js";
import { getClient } from "../helpers.js";

describe("Error Handling (Integration)", () => {
  let client: DosyaClient;

  beforeAll(() => {
    client = getClient();
  });

  describe("invalid resource IDs", () => {
    it("should throw DosyaApiError for non-existent file", async () => {
      try {
        await client.files.get("non-existent-file-id");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DosyaApiError);
        const apiErr = err as DosyaApiError;
        expect(apiErr.status).toBeGreaterThanOrEqual(400);
        expect(apiErr.errorMessage).toBeTruthy();
      }
    });

    it("should throw DosyaApiError for non-existent folder", async () => {
      try {
        await client.folders.get("non-existent-folder-id");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DosyaApiError);
      }
    });

    it("should throw DosyaApiError for non-existent workspace", async () => {
      try {
        await client.workspaces.get("non-existent-workspace-id");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DosyaApiError);
      }
    });

    it("should throw DosyaApiError for non-existent file request", async () => {
      try {
        await client.fileRequests.get("non-existent-request-id");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DosyaApiError);
      }
    });

    it("should throw DosyaApiError for non-existent comment", async () => {
      try {
        await client.comments.edit("non-existent-comment-id", "text");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DosyaApiError);
      }
    });
  });

  describe("authentication errors", () => {
    it("should throw 401 for invalid API key", async () => {
      const badClient = new DosyaClient({
        apiKey: "dos_invalid_key_12345",
        retry: { maxRetries: 0 },
      });

      try {
        await badClient.me.profile();
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DosyaApiError);
        expect((err as DosyaApiError).status).toBe(401);
      }
    });
  });

  describe("error properties", () => {
    it("should include raw response in DosyaApiError", async () => {
      try {
        await client.files.get("fake-id");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DosyaApiError);
        const apiErr = err as DosyaApiError;
        expect(apiErr.raw).toBeDefined();
        expect(apiErr.message).toContain(String(apiErr.status));
      }
    });

    it("should have correct error name", async () => {
      try {
        await client.files.get("fake-id");
        expect.fail("Should have thrown");
      } catch (err) {
        expect((err as DosyaApiError).name).toBe("DosyaApiError");
      }
    });
  });

  describe("client construction errors", () => {
    it("should throw immediately for missing dos_ prefix", () => {
      expect(() => new DosyaClient({ apiKey: "bad_key" })).toThrow(
        "API key must start with 'dos_'",
      );
    });

    it("should throw for empty API key", () => {
      expect(() => new DosyaClient({ apiKey: "" })).toThrow();
    });
  });
});
