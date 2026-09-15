import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyWebhookSignature,
  constructWebhookEvent,
  WEBHOOK_HEADERS,
  WEBHOOK_EVENT_TYPES,
} from "../../src/webhooks.js";
import { DosyaError, DosyaWebhookSignatureError } from "../../src/errors.js";

// ── The server's algorithm, copied from apps/api/src/lib/webhooks/sign.ts ──
async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function signatureHeader(secret: string, body: string, timestamp: number): Promise<string> {
  const hex = await hmacHex(secret, `${timestamp}.${body}`);
  return `t=${timestamp},v1=${hex}`;
}

const SECRET = "whsec_0123456789abcdefghijklmnopqrstuv";
const T = 1760000000;
// Same shape and serialization as the /test route's payload.
const BODY = JSON.stringify({
  id: "evt_abc", type: "file.uploaded", created: T, workspace_id: "ws_1",
  data: { file_id: "test_file", name: "test.txt", size: 12, folder_id: null, version: 1, is_new_version: false, test: true },
});

describe("verifyWebhookSignature", () => {
  it("accepts a header produced by the server's signing code", async () => {
    const header = await signatureHeader(SECRET, BODY, T);
    expect(await verifyWebhookSignature({ payload: BODY, header, secret: SECRET, now: T })).toBe(true);
  });

  it("matches an independent node:crypto HMAC keyed by the full whsec_ string", async () => {
    const hex = createHmac("sha256", SECRET).update(`${T}.${BODY}`).digest("hex");
    const header = `t=${T},v1=${hex}`;
    expect(header).toBe(await signatureHeader(SECRET, BODY, T));
    expect(await verifyWebhookSignature({ payload: BODY, header, secret: SECRET, now: T })).toBe(true);
    // Keying without the prefix must NOT verify.
    const stripped = createHmac("sha256", SECRET.slice("whsec_".length)).update(`${T}.${BODY}`).digest("hex");
    expect(await verifyWebhookSignature({ payload: BODY, header: `t=${T},v1=${stripped}`, secret: SECRET, now: T })).toBe(false);
  });

  it("accepts Uint8Array, Buffer and ArrayBuffer payloads, including non-ASCII bodies", async () => {
    const body = JSON.stringify({ id: "evt_1", type: "file.deleted", created: T, workspace_id: "ws_1", data: { file_id: "f", name: "rapor-şubat-日本.pdf", permanent: false } });
    const header = await signatureHeader(SECRET, body, T);
    const bytes = new TextEncoder().encode(body);
    expect(await verifyWebhookSignature({ payload: bytes, header, secret: SECRET, now: T })).toBe(true);
    expect(await verifyWebhookSignature({ payload: Buffer.from(body), header, secret: SECRET, now: T })).toBe(true);
    expect(await verifyWebhookSignature({ payload: bytes.buffer.slice(0), header, secret: SECRET, now: T })).toBe(true);
    // A view into a larger buffer uses only its own bytes.
    const padded = new Uint8Array(bytes.length + 8);
    padded.set(bytes, 4);
    expect(await verifyWebhookSignature({ payload: padded.subarray(4, 4 + bytes.length), header, secret: SECRET, now: T })).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const header = await signatureHeader(SECRET, BODY, T);
    const tampered = BODY.replace('"size":12', '"size":13');
    expect(await verifyWebhookSignature({ payload: tampered, header, secret: SECRET, now: T })).toBe(false);
  });

  it("rejects re-serialized JSON with different whitespace", async () => {
    const header = await signatureHeader(SECRET, BODY, T);
    expect(await verifyWebhookSignature({ payload: JSON.stringify(JSON.parse(BODY), null, 2), header, secret: SECRET, now: T })).toBe(false);
  });

  it("rejects the wrong secret (e.g. after a roll)", async () => {
    const header = await signatureHeader(SECRET, BODY, T);
    expect(await verifyWebhookSignature({ payload: BODY, header, secret: "whsec_other", now: T })).toBe(false);
  });

  it("rejects a timestamp swapped into a valid signature", async () => {
    const header = await signatureHeader(SECRET, BODY, T);
    const moved = header.replace(`t=${T}`, `t=${T + 1}`);
    expect(await verifyWebhookSignature({ payload: BODY, header: moved, secret: SECRET, now: T })).toBe(false);
  });

  it("enforces the tolerance window in both directions, default 300s", async () => {
    const header = await signatureHeader(SECRET, BODY, T);
    expect(await verifyWebhookSignature({ payload: BODY, header, secret: SECRET, now: T + 300 })).toBe(true);
    expect(await verifyWebhookSignature({ payload: BODY, header, secret: SECRET, now: T + 301 })).toBe(false);
    expect(await verifyWebhookSignature({ payload: BODY, header, secret: SECRET, now: T - 301 })).toBe(false);
    expect(await verifyWebhookSignature({ payload: BODY, header, secret: SECRET, now: T + 1000, toleranceSeconds: 1000 })).toBe(true);
    expect(await verifyWebhookSignature({ payload: BODY, header, secret: SECRET, now: T + 10 ** 9, toleranceSeconds: Infinity })).toBe(true);
  });

  it("uses the system clock when now is omitted", async () => {
    const t = Math.floor(Date.now() / 1000);
    const header = await signatureHeader(SECRET, BODY, t);
    expect(await verifyWebhookSignature({ payload: BODY, header, secret: SECRET })).toBe(true);
  });

  it("tolerates whitespace and extra fields, and accepts any matching v1", async () => {
    const good = await signatureHeader(SECRET, BODY, T);
    const hex = good.split("v1=")[1];
    const header = ` t=${T} , v0=zzz, v1=${"0".repeat(64)}, v1=${hex} `;
    expect(await verifyWebhookSignature({ payload: BODY, header, secret: SECRET, now: T })).toBe(true);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["garbage"],
    [`v1=${"a".repeat(64)}`],
    [`t=abc,v1=${"a".repeat(64)}`],
    [`t=${T}`],
    [`t=${T},v1=nothex`],
    [`t=${T},v1=${"a".repeat(63)}`],
  ])("returns false for malformed header %j", async (header) => {
    expect(await verifyWebhookSignature({ payload: BODY, header, secret: SECRET, now: T })).toBe(false);
  });

  it("throws TypeError for a parsed object payload or missing secret", async () => {
    const header = await signatureHeader(SECRET, BODY, T);
    await expect(
      verifyWebhookSignature({ payload: JSON.parse(BODY) as unknown as string, header, secret: SECRET, now: T }),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(verifyWebhookSignature({ payload: BODY, header, secret: "", now: T })).rejects.toBeInstanceOf(TypeError);
  });
});

describe("constructWebhookEvent", () => {
  it("returns the parsed event, snake_case untouched", async () => {
    const header = await signatureHeader(SECRET, BODY, T);
    const event = await constructWebhookEvent({ payload: BODY, header, secret: SECRET, now: T });
    expect(event.type).toBe("file.uploaded");
    expect(event.workspace_id).toBe("ws_1");
    if (event.type === "file.uploaded") {
      expect(event.data.is_new_version).toBe(false);
      expect(event.data.test).toBe(true);
    }
  });

  it("parses byte payloads", async () => {
    const header = await signatureHeader(SECRET, BODY, T);
    const event = await constructWebhookEvent({ payload: new TextEncoder().encode(BODY), header, secret: SECRET, now: T });
    expect(event.id).toBe("evt_abc");
  });

  it.each([
    ["missing header", undefined, T, /Missing X-Dosya-Signature/],
    ["malformed header", "t=,v1=", T, /Malformed/],
    ["stale timestamp", "SIGNED", T + 3600, /outside the tolerance/],
    ["mismatch", `t=${T},v1=${"b".repeat(64)}`, T, /does not match/],
  ])("throws DosyaWebhookSignatureError for %s", async (_label, header, now, message) => {
    const h = header === "SIGNED" ? await signatureHeader(SECRET, BODY, T) : header;
    const err = await constructWebhookEvent({ payload: BODY, header: h, secret: SECRET, now }).catch((e) => e);
    expect(err).toBeInstanceOf(DosyaWebhookSignatureError);
    expect(err.message).toMatch(message);
  });

  it("throws DosyaError (not a signature error) for a validly signed non-JSON body", async () => {
    const header = await signatureHeader(SECRET, "not json", T);
    const err = await constructWebhookEvent({ payload: "not json", header, secret: SECRET, now: T }).catch((e) => e);
    expect(err).toBeInstanceOf(DosyaError);
    expect(err).not.toBeInstanceOf(DosyaWebhookSignatureError);
  });
});

describe("constants", () => {
  it("names the delivery headers", () => {
    expect(WEBHOOK_HEADERS).toEqual({
      signature: "X-Dosya-Signature",
      eventId: "X-Dosya-Event-Id",
      eventType: "X-Dosya-Event-Type",
      deliveryId: "X-Dosya-Delivery-Id",
    });
    expect(WEBHOOK_EVENT_TYPES).toContain("share.accessed");
  });
});
