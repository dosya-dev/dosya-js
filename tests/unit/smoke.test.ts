import { describe, it, expect } from "vitest";

describe("Smoke test (built output)", () => {
  it("should import DosyaClient from ESM dist", async () => {
    const mod = await import("../../dist/index.js");
    expect(mod.DosyaClient).toBeDefined();
    expect(typeof mod.DosyaClient).toBe("function");
  });

  it("should import all error classes from ESM dist", async () => {
    const mod = await import("../../dist/index.js");
    expect(mod.DosyaError).toBeDefined();
    expect(mod.DosyaApiError).toBeDefined();
    expect(mod.DosyaNetworkError).toBeDefined();
    expect(mod.DosyaUploadError).toBeDefined();
  });

  it("should construct a client from dist export", async () => {
    const { DosyaClient } = await import("../../dist/index.js");
    const client = new DosyaClient({ apiKey: "dos_test123" });
    expect(client).toBeDefined();
    expect(client.files).toBeDefined();
    expect(client.upload).toBeDefined();
    expect(client.download).toBeDefined();
  });

  it("should reject invalid API key from dist export", async () => {
    const { DosyaClient } = await import("../../dist/index.js");
    expect(() => new DosyaClient({ apiKey: "bad_key" })).toThrow(
      "API key must start with 'dos_'",
    );
  });

  it("should import CJS dist", async () => {
    const mod = await import("../../dist/index.cjs");
    expect(mod.DosyaClient || mod.default?.DosyaClient).toBeDefined();
  });
});

describe("Smoke test (0.2 surface)", () => {
  it("exposes every resource namespace on the client", async () => {
    const { DosyaClient } = await import("../../dist/index.js");
    const client = new DosyaClient({ apiKey: "dos_test123" });
    for (const ns of [
      "files", "favourites", "folders", "upload", "download", "shares", "workspaces", "team",
      "roles", "regions", "fileRequests", "search", "comments", "me", "activity", "webhooks", "remoteDownloads",
    ]) {
      expect((client as unknown as Record<string, unknown>)[ns], ns).toBeDefined();
    }
  });

  it("exports runtime helpers and the version", async () => {
    const mod = await import("../../dist/index.js");
    const pkg = await import("../../package.json", { with: { type: "json" } });
    expect(mod.SDK_VERSION).toBe(pkg.default.version);
    expect(mod.DEFAULT_BASE_URL).toBe("https://api.dosya.dev");
    expect(typeof mod.verifyWebhookSignature).toBe("function");
    expect(typeof mod.constructWebhookEvent).toBe("function");
    expect(mod.WEBHOOK_EVENT_TYPES).toContain("file.uploaded");
    expect(mod.DosyaTimeoutError).toBeDefined();
    expect(mod.DosyaWebhookSignatureError).toBeDefined();
  });

  it("serves the webhooks subpath without the client", async () => {
    const esm = await import("../../dist/webhooks.js");
    expect(typeof esm.verifyWebhookSignature).toBe("function");
    const cjs = await import("../../dist/webhooks.cjs");
    expect(typeof (cjs.verifyWebhookSignature ?? cjs.default?.verifyWebhookSignature)).toBe("function");
  });
});
