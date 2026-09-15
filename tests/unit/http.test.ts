import { describe, it, expect, vi } from "vitest";
import { HttpClient } from "../../src/http.js";
import { DosyaApiError, DosyaNetworkError } from "../../src/errors.js";

function mockFetch(
  responses: Array<{
    status: number;
    body?: unknown;
    headers?: Record<string, string>;
  }>,
) {
  let callIndex = 0;
  return vi.fn(async () => {
    const r = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return new Response(
      r.body !== undefined ? JSON.stringify(r.body) : null,
      { status: r.status, headers: new Headers(r.headers) },
    );
  }) as unknown as typeof fetch;
}

function createClient(
  fetchFn: typeof fetch,
  opts?: {
    maxRetries?: number;
    baseDelay?: number;
    onRateLimit?: (info: { limit: number; remaining: number; resetAt: number }) => void;
  },
) {
  return new HttpClient({
    apiKey: "dos_test123",
    fetch: fetchFn,
    retry: {
      maxRetries: opts?.maxRetries ?? 0,
      baseDelay: opts?.baseDelay ?? 10,
      maxDelay: 1000,
    },
    onRateLimit: opts?.onRateLimit,
  });
}

// ─── baseUrl ────────────────────────────────────────────

describe("HttpClient baseUrl", () => {
  it("should default to https://api.dosya.dev", () => {
    const client = new HttpClient({ apiKey: "dos_test" });
    expect(client.baseUrl).toBe("https://api.dosya.dev");
  });

  it("should strip trailing slashes", () => {
    const client = new HttpClient({
      apiKey: "dos_test",
      baseUrl: "https://example.com///",
    });
    expect(client.baseUrl).toBe("https://example.com");
  });

  it("should use custom baseUrl", () => {
    const client = new HttpClient({
      apiKey: "dos_test",
      baseUrl: "https://staging.dosya.dev",
    });
    expect(client.baseUrl).toBe("https://staging.dosya.dev");
  });
});

// ─── request() ──────────────────────────────────────────

describe("HttpClient request()", () => {
  it("should send Authorization header with Bearer token", async () => {
    const fn = mockFetch([{ status: 200, body: { ok: true } }]);
    const client = createClient(fn);
    await client.request({ method: "GET", path: "/api/test" });

    const [, init] = (fn as any).mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer dos_test123");
  });

  it("should convert response keys from snake_case to camelCase", async () => {
    const fn = mockFetch([
      {
        status: 200,
        body: {
          ok: true,
          my_field: "value",
          nested_obj: { inner_key: 42 },
        },
      },
    ]);
    const client = createClient(fn);
    const result = await client.request<any>({
      method: "GET",
      path: "/api/test",
    });

    expect(result.myField).toBe("value");
    expect(result.nestedObj.innerKey).toBe(42);
    // snake_case keys should not exist
    expect(result.my_field).toBeUndefined();
  });

  it("should convert request body keys from camelCase to snake_case", async () => {
    const fn = mockFetch([{ status: 200, body: { ok: true } }]);
    const client = createClient(fn);
    await client.request({
      method: "POST",
      path: "/api/test",
      body: { myField: "value", nestedObj: { innerKey: 42 } },
    });

    const [, init] = (fn as any).mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody.my_field).toBe("value");
    expect(sentBody.nested_obj.inner_key).toBe(42);
  });

  it("should set Content-Type: application/json for JSON bodies", async () => {
    const fn = mockFetch([{ status: 200, body: { ok: true } }]);
    const client = createClient(fn);
    await client.request({
      method: "POST",
      path: "/api/test",
      body: { key: "value" },
    });

    const [, init] = (fn as any).mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("should strip 'ok' field from response payload", async () => {
    const fn = mockFetch([
      { status: 200, body: { ok: true, id: "123", name: "test" } },
    ]);
    const client = createClient(fn);
    const result = await client.request<any>({
      method: "GET",
      path: "/api/test",
    });

    expect(result.ok).toBeUndefined();
    expect(result.id).toBe("123");
    expect(result.name).toBe("test");
  });

  it("should throw DosyaApiError when response ok is false", async () => {
    const fn = mockFetch([
      { status: 400, body: { ok: false, error: "Bad request" } },
    ]);
    const client = createClient(fn);

    await expect(
      client.request({ method: "GET", path: "/api/test" }),
    ).rejects.toThrow(DosyaApiError);
  });

  it("should throw DosyaApiError with correct status and message", async () => {
    const fn = mockFetch([
      { status: 422, body: { ok: false, error: "Validation failed" } },
    ]);
    const client = createClient(fn);

    try {
      await client.request({ method: "GET", path: "/api/test" });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DosyaApiError);
      expect((err as DosyaApiError).status).toBe(422);
      expect((err as DosyaApiError).errorMessage).toBe("Validation failed");
    }
  });

  it("should throw DosyaApiError for invalid JSON response", async () => {
    const fn = vi.fn(
      async () => new Response("not json", { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createClient(fn);

    await expect(
      client.request({ method: "GET", path: "/api/test" }),
    ).rejects.toThrow(DosyaApiError);
  });

  it("should convert query param keys to snake_case", async () => {
    const fn = mockFetch([{ status: 200, body: { ok: true } }]);
    const client = createClient(fn);
    await client.request({
      method: "GET",
      path: "/api/test",
      query: { workspaceId: "ws1", perPage: 10 },
    });

    const [url] = (fn as any).mock.calls[0];
    expect(url).toContain("workspace_id=ws1");
    expect(url).toContain("per_page=10");
  });

  it("should skip null, undefined, and empty string query params", async () => {
    const fn = mockFetch([{ status: 200, body: { ok: true } }]);
    const client = createClient(fn);
    await client.request({
      method: "GET",
      path: "/api/test",
      query: { a: "keep", b: null, c: undefined, d: "" },
    });

    const [url] = (fn as any).mock.calls[0];
    expect(url).toContain("a=keep");
    expect(url).not.toContain("b=");
    expect(url).not.toContain("c=");
    expect(url).not.toContain("d=");
  });

  it("should include boolean query params", async () => {
    const fn = mockFetch([{ status: 200, body: { ok: true } }]);
    const client = createClient(fn);
    await client.request({
      method: "GET",
      path: "/api/test",
      query: { deleted: true },
    });

    const [url] = (fn as any).mock.calls[0];
    expect(url).toContain("deleted=true");
  });

  it("should send rawBody without JSON serialization", async () => {
    const fn = mockFetch([{ status: 200, body: { ok: true } }]);
    const client = createClient(fn);
    const rawBody = new Uint8Array([1, 2, 3]);
    await client.request({
      method: "PUT",
      path: "/api/upload",
      rawBody,
      headers: { "Content-Type": "application/octet-stream" },
    });

    const [, init] = (fn as any).mock.calls[0];
    expect(init.body).toBe(rawBody);
    expect(init.headers["Content-Type"]).toBe("application/octet-stream");
    // Content-Type should NOT be application/json
    expect(init.headers["Content-Type"]).not.toBe("application/json");
  });

  it("should convert arrays in response from snake_case to camelCase", async () => {
    const fn = mockFetch([
      {
        status: 200,
        body: {
          ok: true,
          items: [{ item_name: "a" }, { item_name: "b" }],
        },
      },
    ]);
    const client = createClient(fn);
    const result = await client.request<any>({
      method: "GET",
      path: "/api/test",
    });

    expect(result.items[0].itemName).toBe("a");
    expect(result.items[1].itemName).toBe("b");
  });

  it("should return a redirect untouched from requestRaw with manualRedirect", async () => {
    const fn = mockFetch([
      {
        status: 302,
        headers: { Location: "https://example.com/file" },
      },
    ]);
    const client = createClient(fn);
    const result = await client.requestRaw({
      method: "GET",
      path: "/api/test",
      manualRedirect: true,
    });

    expect(result.status).toBe(302);
    const [, init] = (fn as any).mock.calls[0];
    expect(init.redirect).toBe("manual");
  });

  it("should handle deeply nested snake_case response", async () => {
    const fn = mockFetch([
      {
        status: 200,
        body: {
          ok: true,
          level_one: {
            level_two: {
              level_three_value: "deep",
            },
          },
        },
      },
    ]);
    const client = createClient(fn);
    const result = await client.request<any>({
      method: "GET",
      path: "/api/test",
    });

    expect(result.levelOne.levelTwo.levelThreeValue).toBe("deep");
  });
});

// ─── Retry behavior ─────────────────────────────────────

describe("HttpClient retry behavior", () => {
  it("should retry on 5xx errors", async () => {
    const fn = mockFetch([
      { status: 500, body: { ok: false, error: "Internal error" } },
      { status: 200, body: { ok: true, data: "success" } },
    ]);
    const client = createClient(fn, { maxRetries: 2, baseDelay: 1 });
    const result = await client.request<any>({
      method: "GET",
      path: "/api/test",
    });

    expect(result.data).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on 502 Bad Gateway", async () => {
    const fn = mockFetch([
      { status: 502, body: { ok: false, error: "Bad Gateway" } },
      { status: 200, body: { ok: true } },
    ]);
    const client = createClient(fn, { maxRetries: 1, baseDelay: 1 });
    await client.request({ method: "GET", path: "/api/test" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on 503 Service Unavailable", async () => {
    const fn = mockFetch([
      { status: 503, body: { ok: false, error: "Unavailable" } },
      { status: 200, body: { ok: true } },
    ]);
    const client = createClient(fn, { maxRetries: 1, baseDelay: 1 });
    await client.request({ method: "GET", path: "/api/test" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on 429 rate limit", async () => {
    const fn = mockFetch([
      {
        status: 429,
        body: { ok: false, error: "Rate limited" },
        headers: { "Retry-After": "1" },
      },
      { status: 200, body: { ok: true } },
    ]);
    const client = createClient(fn, { maxRetries: 2, baseDelay: 1 });
    await client.request({ method: "GET", path: "/api/test" });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should throw DosyaNetworkError after all retries exhausted on network failure", async () => {
    const fn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = createClient(fn, { maxRetries: 2, baseDelay: 1 });

    await expect(
      client.request({ method: "GET", path: "/api/test" }),
    ).rejects.toThrow(DosyaNetworkError);
    expect(fn).toHaveBeenCalledTimes(3); // 1 original + 2 retries
  });

  it("should not retry on 4xx errors (except 429)", async () => {
    const fn = mockFetch([
      { status: 400, body: { ok: false, error: "Bad request" } },
    ]);
    const client = createClient(fn, { maxRetries: 2 });

    await expect(
      client.request({ method: "GET", path: "/api/test" }),
    ).rejects.toThrow(DosyaApiError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should not retry on 401 Unauthorized", async () => {
    const fn = mockFetch([
      { status: 401, body: { ok: false, error: "Unauthorized" } },
    ]);
    const client = createClient(fn, { maxRetries: 3 });

    await expect(
      client.request({ method: "GET", path: "/api/test" }),
    ).rejects.toThrow(DosyaApiError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should not retry on 403 Forbidden", async () => {
    const fn = mockFetch([
      { status: 403, body: { ok: false, error: "Forbidden" } },
    ]);
    const client = createClient(fn, { maxRetries: 3 });

    await expect(
      client.request({ method: "GET", path: "/api/test" }),
    ).rejects.toThrow(DosyaApiError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should not retry on 404 Not Found", async () => {
    const fn = mockFetch([
      { status: 404, body: { ok: false, error: "Not found" } },
    ]);
    const client = createClient(fn, { maxRetries: 3 });

    await expect(
      client.request({ method: "GET", path: "/api/test" }),
    ).rejects.toThrow(DosyaApiError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should rethrow a caller abort immediately without retrying", async () => {
    const controller = new AbortController();
    const fn = vi.fn(async () => {
      controller.abort(new DOMException("Aborted", "AbortError"));
      throw new DOMException("Aborted", "AbortError");
    }) as unknown as typeof fetch;
    const client = createClient(fn, { maxRetries: 3 });

    await expect(
      client.request({ method: "GET", path: "/api/test", signal: controller.signal }),
    ).rejects.toThrow("Aborted");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should succeed on last retry attempt", async () => {
    const fn = mockFetch([
      { status: 500, body: { ok: false, error: "err" } },
      { status: 500, body: { ok: false, error: "err" } },
      { status: 200, body: { ok: true, id: "abc" } },
    ]);
    const client = createClient(fn, { maxRetries: 2, baseDelay: 1 });
    const result = await client.request<any>({
      method: "GET",
      path: "/api/test",
    });

    expect(result.id).toBe("abc");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should fail after exhausting all 5xx retries", async () => {
    const fn = mockFetch([
      { status: 500, body: { ok: false, error: "err" } },
      { status: 500, body: { ok: false, error: "err" } },
      { status: 500, body: { ok: false, error: "still broken" } },
    ]);
    const client = createClient(fn, { maxRetries: 2, baseDelay: 1 });

    try {
      await client.request({ method: "GET", path: "/api/test" });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DosyaApiError);
      expect((err as DosyaApiError).errorMessage).toBe("still broken");
    }
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ─── Rate limit callback ────────────────────────────────

describe("HttpClient rate limit callback", () => {
  it("should call onRateLimit with parsed headers", async () => {
    const onRateLimit = vi.fn();
    const fn = mockFetch([
      {
        status: 200,
        body: { ok: true },
        headers: {
          "X-RateLimit-Limit": "100",
          "X-RateLimit-Remaining": "95",
          "X-RateLimit-Reset": "1700000000",
        },
      },
    ]);
    const client = createClient(fn, { onRateLimit });
    await client.request({ method: "GET", path: "/api/test" });

    expect(onRateLimit).toHaveBeenCalledWith({
      limit: 100,
      remaining: 95,
      resetAt: 1700000000,
    });
  });

  it("should not call onRateLimit when headers are missing", async () => {
    const onRateLimit = vi.fn();
    const fn = mockFetch([{ status: 200, body: { ok: true } }]);
    const client = createClient(fn, { onRateLimit });
    await client.request({ method: "GET", path: "/api/test" });

    expect(onRateLimit).not.toHaveBeenCalled();
  });

  it("should not call onRateLimit when only some headers are present", async () => {
    const onRateLimit = vi.fn();
    const fn = mockFetch([
      {
        status: 200,
        body: { ok: true },
        headers: { "X-RateLimit-Limit": "100" },
      },
    ]);
    const client = createClient(fn, { onRateLimit });
    await client.request({ method: "GET", path: "/api/test" });

    expect(onRateLimit).not.toHaveBeenCalled();
  });
});

// ─── requestRaw() ───────────────────────────────────────

describe("HttpClient requestRaw()", () => {
  it("should throw DosyaApiError for error statuses", async () => {
    const fn = mockFetch([{ status: 404, body: { ok: false, error: "File not found" } }]);
    const client = createClient(fn);
    await expect(client.requestRaw({ method: "GET", path: "/api/test" })).rejects.toMatchObject({
      status: 404,
      errorMessage: "File not found",
    });
  });

  it("should return the raw Response object", async () => {
    const fn = mockFetch([
      { status: 200, body: { data: "hello" } },
    ]);
    const client = createClient(fn);
    const result = await client.requestRaw({
      method: "GET",
      path: "/api/test",
    });

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(200);
  });
});

// ─── Default timeout ──────────────────────────────────────

describe("HttpClient default timeout", () => {
  it("should pass AbortSignal.timeout when no signal is provided", async () => {
    let capturedSignal: AbortSignal | undefined;
    const fn = vi.fn(async (_url: string, init: any) => {
      capturedSignal = init?.signal;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new HttpClient({
      apiKey: "dos_test",
      fetch: fn,
      timeout: 5000,
      retry: { maxRetries: 0 },
    });
    await client.request({ method: "GET", path: "/api/test" });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);
  });

  it("should link the caller signal to the attempt signal", async () => {
    const caller = new AbortController();
    const callerSignal = caller.signal;
    let capturedSignal: AbortSignal | undefined;
    const fn = vi.fn(async (_url: string, init: any) => {
      capturedSignal = init?.signal;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new HttpClient({
      apiKey: "dos_test",
      fetch: fn,
      retry: { maxRetries: 0 },
    });
    await client.request({ method: "GET", path: "/api/test", signal: callerSignal });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);
    caller.abort();
    expect(capturedSignal!.aborted).toBe(true);
  });
});

// ─── Debug callback ───────────────────────────────────────

describe("HttpClient debug callback", () => {
  it("should call debug function on request and response", async () => {
    const debugMessages: string[] = [];
    const fn = mockFetch([{ status: 200, body: { ok: true } }]);

    const client = new HttpClient({
      apiKey: "dos_test",
      fetch: fn,
      debug: (msg) => debugMessages.push(msg),
      retry: { maxRetries: 0 },
    });
    await client.request({ method: "GET", path: "/api/test" });

    expect(debugMessages.length).toBe(2);
    expect(debugMessages[0]).toContain("GET");
    expect(debugMessages[0]).toContain("/api/test");
    expect(debugMessages[0]).toContain("attempt 1");
    expect(debugMessages[1]).toContain("200");
  });

  it("should log retry attempts", async () => {
    const debugMessages: string[] = [];
    const fn = mockFetch([
      { status: 500, body: { ok: false, error: "err" } },
      { status: 200, body: { ok: true } },
    ]);

    const client = new HttpClient({
      apiKey: "dos_test",
      fetch: fn,
      debug: (msg) => debugMessages.push(msg),
      retry: { maxRetries: 1, baseDelay: 1 },
    });
    await client.request({ method: "GET", path: "/api/test" });

    expect(debugMessages.some((m) => m.includes("HTTP 500"))).toBe(true);
    expect(debugMessages.some((m) => m.includes("attempt 2"))).toBe(true);
  });

  it("should not throw if debug is not provided", async () => {
    const fn = mockFetch([{ status: 200, body: { ok: true } }]);
    const client = createClient(fn);
    await expect(
      client.request({ method: "GET", path: "/api/test" }),
    ).resolves.toBeDefined();
  });
});

// ─── 0.2 transport rules ──────────────────────────────────

import { mockApi, ok, fail } from "./_mock.js";
import { camelToSnake, snakeToCamel, parseRetryAfter, seg } from "../../src/http.js";
import { DosyaTimeoutError } from "../../src/errors.js";

describe("key conversion", () => {
  it("handles digits after an underscore in both directions", () => {
    expect(snakeToCamel("require_2fa")).toBe("require2fa");
    expect(snakeToCamel("user_has_2fa")).toBe("userHas2fa");
    expect(camelToSnake("require2fa")).toBe("require_2fa");
    expect(camelToSnake("userHas2fa")).toBe("user_has_2fa");
  });

  it("leaves digits that belong to a word alone", () => {
    expect(camelToSnake("r2Key")).toBe("r2_key");
    expect(camelToSnake("s3AccessKeyId")).toBe("s3_access_key_id");
    expect(camelToSnake("maxR2Calls")).toBe("max_r2_calls");
    expect(camelToSnake("sha256")).toBe("sha256");
    expect(snakeToCamel("r2_key")).toBe("r2Key");
  });

  it("does not rewrite keys inside data maps", async () => {
    const api = mockApi({
      "GET /api/x": ok({ role_id: "r", permissions: { upload_files: true }, meta: { old_name: "a" } }),
      "POST /api/x": ok(),
    });
    const http = api.http();
    const res = await http.request<any>({ method: "GET", path: "/api/x" });
    expect(res.roleId).toBe("r");
    expect(res.permissions).toEqual({ upload_files: true });
    expect(res.meta).toEqual({ old_name: "a" });

    await http.request({ method: "POST", path: "/api/x", body: { roleName: "x", permissions: { upload_files: false } } });
    expect(api.calls[1].body).toEqual({ role_name: "x", permissions: { upload_files: false } });
  });
});

describe("ids and urls", () => {
  it("rejects dot segments and empty ids", () => {
    expect(() => seg("..")).toThrow(TypeError);
    expect(() => seg(".")).toThrow(TypeError);
    expect(() => seg("")).toThrow(TypeError);
  });

  it("encodes separators so an id cannot change the route", () => {
    expect(seg("../workspaces/ws_1")).toBe("..%2Fworkspaces%2Fws_1");
    expect(seg("a?b#c")).toBe("a%3Fb%23c");
  });

  it("keeps a path prefix on baseUrl", async () => {
    const api = mockApi({ "GET /proxy/api/me": ok() });
    await api.http({ baseUrl: "https://api.test/proxy/" }).request({ method: "GET", path: "/api/me" });
    expect(api.calls[0].path).toBe("/proxy/api/me");
  });
});

describe("retry policy", () => {
  it("does not retry a POST on a 500", async () => {
    const api = mockApi({ "POST /api/x": [fail(500, "boom"), ok()] });
    await expect(
      api.http({ retry: { maxRetries: 3, baseDelay: 1 } }).request({ method: "POST", path: "/api/x", body: {} }),
    ).rejects.toMatchObject({ status: 500 });
    expect(api.calls).toHaveLength(1);
  });

  it("does not retry a POST on a 503, even with Retry-After (it may come from inside a handler)", async () => {
    const api = mockApi({ "POST /api/x": [fail(503, "Workspace is moving", {}, { "Retry-After": "0" }), ok({ id: 1 })] });
    await expect(
      api.http({ retry: { maxRetries: 1 } }).request<any>({ method: "POST", path: "/api/x", body: {} }),
    ).rejects.toMatchObject({ status: 503 });
    expect(api.calls).toHaveLength(1);
  });

  it("retries a GET on a 503 after Retry-After", async () => {
    const api = mockApi({ "GET /api/x": [fail(503, "down", {}, { "Retry-After": "0" }), ok({ id: 1 })] });
    const res = await api.http({ retry: { maxRetries: 1 } }).request<any>({ method: "GET", path: "/api/x" });
    expect(res.id).toBe(1);
  });

  it("retries a POST on a 429 with Retry-After", async () => {
    const api = mockApi({ "POST /api/x": [fail(429, "Too many requests", {}, { "Retry-After": "0" }), ok()] });
    await api.http({ retry: { maxRetries: 1 } }).request({ method: "POST", path: "/api/x", body: {} });
    expect(api.calls).toHaveLength(2);
  });

  it("does not retry a 429 without Retry-After (business limit)", async () => {
    const api = mockApi({ "GET /api/x": [fail(429, "Daily limit of 20 remote downloads reached"), ok()] });
    await expect(api.http({ retry: { maxRetries: 3 } }).request({ method: "GET", path: "/api/x" })).rejects.toMatchObject({
      status: 429,
    });
    expect(api.calls).toHaveLength(1);
  });

  it("surfaces a Retry-After longer than maxDelay instead of sleeping", async () => {
    const api = mockApi({ "GET /api/x": [fail(429, "Usage limit", {}, { "Retry-After": "3600" }), ok()] });
    const err: any = await api
      .http({ retry: { maxRetries: 3, maxDelay: 1000 } })
      .request({ method: "GET", path: "/api/x" })
      .catch((e: any) => e);
    expect(err).toBeInstanceOf(DosyaApiError);
    expect(err.retryAfter).toBe(3600);
    expect(api.calls).toHaveLength(1);
  });

  it("retries a POST when retry is 'always'", async () => {
    const api = mockApi({ "POST /api/x": [fail(500, "boom"), ok()] });
    await api.http({ retry: { maxRetries: 1, baseDelay: 1 } }).request({ method: "POST", path: "/api/x", retry: "always" });
    expect(api.calls).toHaveLength(2);
  });

  it("makes a single attempt when retry is 'never'", async () => {
    const api = mockApi({ "GET /api/x": [fail(503, "down", {}, { "Retry-After": "0" }), ok()] });
    await expect(
      api.http({ retry: { maxRetries: 3 } }).request({ method: "GET", path: "/api/x", retry: "never" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(api.calls).toHaveLength(1);
  });

  it("does not retry a POST after a network error", async () => {
    const fn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = createClient(fn, { maxRetries: 3, baseDelay: 1 });
    await expect(client.request({ method: "POST", path: "/api/x", body: {} })).rejects.toThrow(DosyaNetworkError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("parses Retry-After as seconds or an HTTP date", () => {
    expect(parseRetryAfter("5")).toBe(5);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 0)).toBe(10);
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe("timeouts", () => {
  function hangingFetch() {
    return vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    ) as unknown as typeof fetch;
  }

  it("gives each attempt a fresh timeout and retries idempotent requests", async () => {
    const fn = hangingFetch();
    const client = new HttpClient({ apiKey: "dos_t", fetch: fn, timeout: 20, retry: { maxRetries: 2, baseDelay: 1 } });
    await expect(client.request({ method: "GET", path: "/api/x" })).rejects.toBeInstanceOf(DosyaTimeoutError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a timed-out POST", async () => {
    const fn = hangingFetch();
    const client = new HttpClient({ apiKey: "dos_t", fetch: fn, timeout: 20, retry: { maxRetries: 2, baseDelay: 1 } });
    await expect(client.request({ method: "POST", path: "/api/x", body: {} })).rejects.toBeInstanceOf(DosyaTimeoutError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("lets the caller abort a backoff sleep", async () => {
    const controller = new AbortController();
    const api = mockApi({ "GET /api/x": fail(500, "boom") });
    const p = api.http({ retry: { maxRetries: 3, baseDelay: 10_000, maxDelay: 60_000 } }).request({
      method: "GET",
      path: "/api/x",
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(new DOMException("stop", "AbortError")), 10);
    await expect(p).rejects.toThrow("stop");
    expect(api.calls).toHaveLength(1);
  });
});

describe("errors", () => {
  it("exposes the machine code, details and route", async () => {
    const api = mockApi({
      "GET /api/files": fail(403, "folder_locked", { folder_id: "fld_1", lock_mode: "full_lock" }),
      "POST /api/remote-downloads": fail(400, "This address isn't allowed", { code: "ssrf_blocked" }),
    });
    const http = api.http();
    const locked: any = await http.request({ method: "GET", path: "/api/files" }).catch((e: any) => e);
    expect(locked.code).toBe("folder_locked");
    expect(locked.details).toEqual({ folder_id: "fld_1", lock_mode: "full_lock" });
    expect(locked.method).toBe("GET");
    expect(locked.path).toBe("/api/files");

    const ssrf: any = await http.request({ method: "POST", path: "/api/remote-downloads", body: {} }).catch((e: any) => e);
    expect(ssrf.code).toBe("ssrf_blocked");
    expect(ssrf.errorMessage).toBe("This address isn't allowed");
  });

  it("does not invent a code from a sentence", async () => {
    const api = mockApi({ "GET /api/x": fail(404, "File not found") });
    const err: any = await api.http().request({ method: "GET", path: "/api/x" }).catch((e: any) => e);
    expect(err.code).toBeUndefined();
  });

  it("reports an HTML error page by status", async () => {
    const api = mockApi({ "GET /api/x": { status: 404, body: "<html>nope</html>" } });
    const err: any = await api.http().request({ method: "GET", path: "/api/x" }).catch((e: any) => e);
    expect(err).toBeInstanceOf(DosyaApiError);
    expect(err.errorMessage).toContain("HTTP 404");
  });

  it("accepts bare JSON when envelope is false", async () => {
    const api = mockApi({ "GET /api/x": { body: { url: "https://r2/x", size_bytes: 3 } } });
    const res = await api.http().request<any>({ method: "GET", path: "/api/x", envelope: false });
    expect(res).toEqual({ url: "https://r2/x", sizeBytes: 3 });
  });
});

describe("read-your-writes bookmark", () => {
  const b1 = "00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683";
  const b2 = "00000085-0000024c-00004c6e-8e61117bf38d7adb71b934ebbf891683";

  it("echoes the newest bookmark and never moves backwards", async () => {
    const api = mockApi({
      "POST /api/a": { body: { ok: true }, headers: { "X-D1-Bookmark": b2 } },
      "GET /api/b": { body: { ok: true }, headers: { "X-D1-Bookmark": b1 } },
      "GET /api/c": ok(),
    });
    const http = api.http();
    await http.request({ method: "POST", path: "/api/a", body: {} });
    await http.request({ method: "GET", path: "/api/b" });
    await http.request({ method: "GET", path: "/api/c" });
    expect(api.calls[0].headers["x-d1-bookmark"]).toBeUndefined();
    expect(api.calls[1].headers["x-d1-bookmark"]).toBe(b2);
    expect(api.calls[2].headers["x-d1-bookmark"]).toBe(b2);
  });

  it("can be turned off", async () => {
    const api = mockApi({ "GET /api/a": { body: { ok: true }, headers: { "X-D1-Bookmark": b1 } } });
    const http = api.http({ readYourWrites: false });
    await http.request({ method: "GET", path: "/api/a" });
    await http.request({ method: "GET", path: "/api/a" });
    expect(api.calls[1].headers["x-d1-bookmark"]).toBeUndefined();
  });
});

describe("body read timeout", () => {
  it("times out a JSON response whose body stalls after the headers", async () => {
    const fn = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"ok":tr'));
          init.signal!.addEventListener("abort", () => controller.error(init.signal!.reason));
        },
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const client = new HttpClient({ apiKey: "dos_t", fetch: fn, timeout: 30, retry: { maxRetries: 0 } });
    await expect(client.request({ method: "GET", path: "/api/x" })).rejects.toBeInstanceOf(DosyaTimeoutError);
  });

  it("does not time out a raw stream once headers have arrived", async () => {
    let signal: AbortSignal | undefined;
    const fn = vi.fn(async (_url: string, init: RequestInit) => {
      signal = init.signal!;
      return new Response("bytes", { status: 200 });
    }) as unknown as typeof fetch;
    const client = new HttpClient({ apiKey: "dos_t", fetch: fn, timeout: 10, retry: { maxRetries: 0 } });
    const res = await client.requestRaw({ method: "GET", path: "/api/x" });
    await new Promise((r) => setTimeout(r, 30));
    expect(signal!.aborted).toBe(false);
    expect(await res.text()).toBe("bytes");
  });
});
