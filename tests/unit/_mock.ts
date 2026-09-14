import { vi } from "vitest";
import { HttpClient } from "../../src/http.js";
import type { DosyaClientOptions } from "../../src/types.js";

export interface RecordedCall {
  method: string;
  /** Path without origin, e.g. "/api/files/f_1". */
  path: string;
  /** Parsed query string. */
  query: Record<string, string>;
  headers: Record<string, string>;
  /** Parsed JSON body, or the raw body when it was not JSON. */
  body: unknown;
  rawBody: BodyInit | null | undefined;
}

export interface MockReply {
  status?: number;
  /** JSON-serialised unless it is a string, Uint8Array or ArrayBuffer. */
  body?: unknown;
  headers?: Record<string, string>;
}

type Handler = MockReply | ((call: RecordedCall) => MockReply | Promise<MockReply>);

/**
 * A fetch that answers from a route table keyed "METHOD /path" (query ignored)
 * and records every call. Unmatched requests answer 599 so tests fail loudly.
 */
export function mockApi(routes: Record<string, Handler | Handler[]> = {}) {
  const calls: RecordedCall[] = [];
  const counters = new Map<string, number>();

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v;
    });

    let body: unknown = init?.body;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }

    const call: RecordedCall = {
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers,
      body,
      rawBody: init?.body,
    };
    calls.push(call);

    const key = `${method} ${url.pathname}`;
    const entry = routes[key];
    if (entry === undefined) {
      return new Response(JSON.stringify({ ok: false, error: `unmocked ${key}` }), { status: 599 });
    }
    let handler: Handler;
    if (Array.isArray(entry)) {
      const n = counters.get(key) ?? 0;
      counters.set(key, n + 1);
      handler = entry[Math.min(n, entry.length - 1)];
    } else {
      handler = entry;
    }
    const reply = typeof handler === "function" ? await handler(call) : handler;
    return toResponse(reply);
  }) as unknown as typeof globalThis.fetch;

  const http = (options: Partial<DosyaClientOptions> = {}) =>
    new HttpClient({
      apiKey: "dos_test",
      baseUrl: "https://api.test",
      fetch,
      retry: { maxRetries: 0, baseDelay: 1, maxDelay: 50 },
      ...options,
    });

  return { fetch, calls, http };
}

function toResponse(reply: MockReply): Response {
  const status = reply.status ?? 200;
  const headers = new Headers(reply.headers);
  let body: BodyInit | null = null;
  if (reply.body instanceof Uint8Array || reply.body instanceof ArrayBuffer || typeof reply.body === "string") {
    body = reply.body as BodyInit;
  } else if (reply.body !== undefined) {
    body = JSON.stringify(reply.body);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }
  // Response forbids a body on these statuses.
  if (status === 204 || status === 304) body = null;
  return new Response(body, { status, headers });
}

/** Shorthand for a successful enveloped reply. */
export function ok(payload: Record<string, unknown> = {}, status = 200): MockReply {
  return { status, body: { ok: true, ...payload } };
}

/** Shorthand for an API error reply. */
export function fail(status: number, error: string, extra: Record<string, unknown> = {}, headers?: Record<string, string>): MockReply {
  return { status, body: { ok: false, error, ...extra }, headers };
}
