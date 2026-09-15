/**
 * Webhook signature verification. Standalone: needs no DosyaClient or API key,
 * only WebCrypto (global `crypto.subtle`, or `node:crypto` on Node 18), so it runs in Node >= 18, Deno,
 * Bun, Cloudflare Workers and browsers.
 *
 * Protocol: dosya POSTs the event JSON with
 * `X-Dosya-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>`, where the HMAC key
 * is the UTF-8 bytes of the whole secret (including the `whsec_` prefix) and the
 * message is `<t>.<raw body>`. `t` is the delivery attempt time, re-signed on
 * every retry.
 */
import { DosyaError, DosyaWebhookSignatureError } from "./errors.js";
import { getSubtle } from "./crypto.js";
import type { WebhookEvent } from "./types/webhooks.js";

export { WEBHOOK_EVENT_TYPES } from "./types/webhooks.js";

/** Header names dosya sets on every webhook delivery. */
export const WEBHOOK_HEADERS = {
  /** `t=<unix seconds>,v1=<hex>` */
  signature: "X-Dosya-Signature",
  /** `evt_...` - identical across retries and redeliveries; dedupe on this. */
  eventId: "X-Dosya-Event-Id",
  /** `file.uploaded` | `file.deleted` | `share.accessed` */
  eventType: "X-Dosya-Event-Type",
  /** `whd_...` - unique per delivery attempt row. */
  deliveryId: "X-Dosya-Delivery-Id",
} as const;

export interface VerifyWebhookOptions {
  /**
   * The RAW request body exactly as received (e.g. `await request.text()` or the
   * raw Buffer). A re-serialized `JSON.stringify(parsed)` will not verify.
   */
  payload: string | Uint8Array | ArrayBuffer;
  /** Value of the `X-Dosya-Signature` header. */
  header: string | null | undefined;
  /** The endpoint's `whsec_...` secret, from `webhooks.create()` or `webhooks.rollSecret()`. */
  secret: string;
  /**
   * Maximum age (and clock skew) of the signature timestamp, in seconds.
   * Default 300. Pass `Infinity` to skip the check (not recommended).
   */
  toleranceSeconds?: number;
  /** Current time in unix seconds. Defaults to the system clock; for tests. */
  now?: number;
}

/**
 * Check a webhook delivery's signature. Resolves `true` only when the header is
 * well formed, its timestamp is within tolerance and an HMAC matches. Never
 * throws for a bad signature; use `constructWebhookEvent` for the reason.
 */
export async function verifyWebhookSignature(options: VerifyWebhookOptions): Promise<boolean> {
  return (await signatureProblem(options)) === null;
}

/**
 * Verify a delivery and parse its body into a typed `WebhookEvent`.
 * Throws `DosyaWebhookSignatureError` for a missing or malformed header, a
 * timestamp outside tolerance, or a signature mismatch. The event is returned
 * exactly as delivered (snake_case keys).
 */
export async function constructWebhookEvent(options: VerifyWebhookOptions): Promise<WebhookEvent> {
  const problem = await signatureProblem(options);
  if (problem !== null) throw new DosyaWebhookSignatureError(problem);
  const text = typeof options.payload === "string"
    ? options.payload
    : new TextDecoder().decode(options.payload);
  try {
    return JSON.parse(text) as WebhookEvent;
  } catch {
    throw new DosyaError("Webhook payload is not valid JSON");
  }
}

const encoder = new TextEncoder();

/** Null when the signature is valid, otherwise a human-readable reason. */
async function signatureProblem(options: VerifyWebhookOptions): Promise<string | null> {
  const { payload, header, secret } = options;
  const tolerance = options.toleranceSeconds ?? 300;

  if (typeof secret !== "string" || secret === "") {
    throw new TypeError("verifyWebhookSignature: `secret` is required");
  }
  const body = toBytes(payload);

  if (header == null || header.trim() === "") {
    return "Missing X-Dosya-Signature header";
  }

  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1") signatures.push(value);
  }
  if (timestamp === undefined || !/^\d+$/.test(timestamp)) {
    return "Malformed X-Dosya-Signature header: missing or invalid timestamp";
  }
  const valid = signatures.filter((s) => /^[0-9a-fA-F]{64}$/.test(s));
  if (valid.length === 0) {
    return "Malformed X-Dosya-Signature header: missing or invalid v1 signature";
  }

  const t = parseInt(timestamp, 10);
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > tolerance) {
    return `Webhook timestamp is outside the tolerance of ${tolerance}s`;
  }

  const subtle = await getSubtle();

  const key = await subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const prefix = encoder.encode(`${timestamp}.`);
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix, 0);
  message.set(body, prefix.length);

  for (const hex of valid) {
    // subtle.verify compares in constant time.
    if (await subtle.verify("HMAC", key, hexToBytes(hex), message)) return null;
  }
  return "Webhook signature does not match";
}

function toBytes(payload: VerifyWebhookOptions["payload"]): Uint8Array {
  if (typeof payload === "string") return encoder.encode(payload);
  // isView / tag checks rather than instanceof, so bytes from another realm still count.
  if (ArrayBuffer.isView(payload)) return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  if (Object.prototype.toString.call(payload) === "[object ArrayBuffer]") return new Uint8Array(payload as ArrayBuffer);
  throw new TypeError(
    "verifyWebhookSignature: `payload` must be the raw body as a string, Uint8Array or ArrayBuffer, not a parsed object",
  );
}

function hexToBytes(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
