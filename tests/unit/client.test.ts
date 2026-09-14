import { describe, it, expect } from "vitest";
import { DosyaClient } from "../../src/index.js";

describe("DosyaClient", () => {
  it("should throw if API key does not start with dos_", () => {
    expect(() => new DosyaClient({ apiKey: "invalid-key" })).toThrow(
      "API key must start with 'dos_'",
    );
  });

  it("should throw for empty API key", () => {
    expect(() => new DosyaClient({ apiKey: "" })).toThrow(
      "API key must start with 'dos_'",
    );
  });

  it("should throw for undefined-like API key", () => {
    expect(() => new DosyaClient({ apiKey: "sk_live_abc" })).toThrow(
      "API key must start with 'dos_'",
    );
  });

  it("should create client with valid API key", () => {
    const client = new DosyaClient({ apiKey: "dos_test123" });
    expect(client).toBeInstanceOf(DosyaClient);
  });

  it("should expose all resource modules", () => {
    const client = new DosyaClient({ apiKey: "dos_test123" });

    expect(client.files).toBeDefined();
    expect(client.folders).toBeDefined();
    expect(client.upload).toBeDefined();
    expect(client.download).toBeDefined();
    expect(client.shares).toBeDefined();
    expect(client.workspaces).toBeDefined();
    expect(client.fileRequests).toBeDefined();
    expect(client.search).toBeDefined();
    expect(client.comments).toBeDefined();
    expect(client.me).toBeDefined();
    expect(client.activity).toBeDefined();
  });

  it("should accept custom baseUrl", () => {
    const client = new DosyaClient({
      apiKey: "dos_test123",
      baseUrl: "https://staging.dosya.dev",
    });
    expect(client).toBeInstanceOf(DosyaClient);
  });

  it("should accept retry options", () => {
    const client = new DosyaClient({
      apiKey: "dos_test123",
      retry: { maxRetries: 5, baseDelay: 1000, maxDelay: 60000 },
    });
    expect(client).toBeInstanceOf(DosyaClient);
  });

  it("should accept onRateLimit callback", () => {
    const client = new DosyaClient({
      apiKey: "dos_test123",
      onRateLimit: () => {},
    });
    expect(client).toBeInstanceOf(DosyaClient);
  });

  it("should accept custom fetch function", () => {
    const customFetch = async () => new Response();
    const client = new DosyaClient({
      apiKey: "dos_test123",
      fetch: customFetch as typeof fetch,
    });
    expect(client).toBeInstanceOf(DosyaClient);
  });
});
