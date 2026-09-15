import { describe, it, expect } from "vitest";
import {
  DosyaError,
  DosyaApiError,
  DosyaNetworkError,
  DosyaUploadError,
} from "../../src/errors.js";

describe("DosyaError", () => {
  it("should set name and message", () => {
    const err = new DosyaError("something broke");
    expect(err.name).toBe("DosyaError");
    expect(err.message).toBe("something broke");
  });

  it("should be an instance of Error", () => {
    expect(new DosyaError("x")).toBeInstanceOf(Error);
  });
});

describe("DosyaApiError", () => {
  it("should set status, errorMessage, and raw payload", () => {
    const raw = { ok: false, error: "not found" };
    const err = new DosyaApiError(404, "not found", raw);

    expect(err.name).toBe("DosyaApiError");
    expect(err.status).toBe(404);
    expect(err.errorMessage).toBe("not found");
    expect(err.raw).toEqual(raw);
    expect(err.message).toBe("[404] not found");
  });

  it("should work without raw payload", () => {
    const err = new DosyaApiError(500, "server error");
    expect(err.raw).toBeUndefined();
  });

  it("should be an instance of DosyaError and Error", () => {
    const err = new DosyaApiError(400, "bad request");
    expect(err).toBeInstanceOf(DosyaError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("DosyaNetworkError", () => {
  it("should set cause from options", () => {
    const cause = new TypeError("fetch failed");
    const err = new DosyaNetworkError("network error", { cause });

    expect(err.name).toBe("DosyaNetworkError");
    expect(err.message).toBe("network error");
    expect(err.cause).toBe(cause);
  });

  it("should work without cause", () => {
    const err = new DosyaNetworkError("timeout");
    expect(err.cause).toBeUndefined();
  });

  it("should be an instance of DosyaError and Error", () => {
    const err = new DosyaNetworkError("x");
    expect(err).toBeInstanceOf(DosyaError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("DosyaUploadError", () => {
  it("should set sessionId and partNumber", () => {
    const err = new DosyaUploadError("part failed", "sess-123", 5);

    expect(err.name).toBe("DosyaUploadError");
    expect(err.message).toBe("part failed");
    expect(err.sessionId).toBe("sess-123");
    expect(err.partNumber).toBe(5);
  });

  it("should work without partNumber", () => {
    const err = new DosyaUploadError("init failed", "sess-456");
    expect(err.partNumber).toBeUndefined();
  });

  it("should be an instance of DosyaError and Error", () => {
    const err = new DosyaUploadError("x", "s");
    expect(err).toBeInstanceOf(DosyaError);
    expect(err).toBeInstanceOf(Error);
  });
});
