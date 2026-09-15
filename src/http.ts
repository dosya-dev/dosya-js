import { DosyaApiError, DosyaNetworkError, DosyaTimeoutError } from "./errors.js";
import type {
  DosyaClientOptions,
  HttpMethod,
  QueryValue,
  RateLimitInfo,
  RequestOptions,
} from "./types.js";

export const DEFAULT_BASE_URL = "https://api.dosya.dev";

const BOOKMARK_HEADER = "X-D1-Bookmark";
const IDEMPOTENT: ReadonlySet<HttpMethod> = new Set(["GET", "HEAD", "PUT", "DELETE"]);

/**
 * Fields whose VALUE is a data map (permission names, metadata, month keys),
 * not an object with field names. Their keys are passed through unconverted.
 */
const OPAQUE_KEYS: ReadonlySet<string> = new Set(["permissions", "meta", "counts"]);

export function camelToSnake(str: string): string {
  return str
    .replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
    // require2fa -> require_2fa, userHas2fa -> user_has_2fa; r2Key and sha256 stay intact.
    .replace(/(?<=[a-z])(\d+)(?=[a-z])/g, "_$1");
}

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function convertKeys(obj: unknown, fn: (key: string) => string): unknown {
  if (Array.isArray(obj)) return obj.map((v) => convertKeys(v, fn));
  if (isPlainObject(obj)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[fn(k)] = OPAQUE_KEYS.has(k) ? v : convertKeys(v, fn);
    }
    return out;
  }
  return obj;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Encode one caller-supplied id as a single opaque path segment. */
export function seg(id: string): string {
  if (typeof id !== "string" || id === "" || id === "." || id === "..") {
    throw new TypeError(`Invalid id: ${JSON.stringify(id)}`);
  }
  return encodeURIComponent(id);
}

/** Parse `Retry-After` (delta-seconds or HTTP-date) into seconds. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

function machineCode(body: Record<string, unknown>): string | undefined {
  if (typeof body.code === "string") return body.code;
  if (typeof body.error_code === "string") return body.error_code;
  // Several routes put the machine code in `error` itself (folder_locked, version_conflict).
  if (typeof body.error === "string" && /^[a-z][a-z0-9_]*$/.test(body.error)) return body.error;
  return undefined;
}

export class HttpClient {
  readonly baseUrl: string;
  readonly fetchFn: typeof globalThis.fetch;
  readonly maxRetries: number;
  readonly baseDelay: number;
  readonly maxDelay: number;
  readonly timeout: number;
  readonly uploadTimeout: number;
  private readonly apiKey: string;
  private readonly readYourWrites: boolean;
  private readonly onRateLimit?: (info: RateLimitInfo) => void;
  private readonly debugFn?: (message: string) => void;
  private bookmark: string | null = null;

  constructor(options: DosyaClientOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxRetries = options.retry?.maxRetries ?? 3;
    this.baseDelay = options.retry?.baseDelay ?? 500;
    this.maxDelay = options.retry?.maxDelay ?? 30_000;
    this.timeout = options.timeout ?? 30_000;
    this.uploadTimeout = options.uploadTimeout ?? 600_000;
    this.readYourWrites = options.readYourWrites ?? true;
    this.onRateLimit = options.onRateLimit;
    this.debugFn = options.debug;
  }

  /** JSON request. Resolves to the camelCased payload without `ok`; throws DosyaApiError otherwise. */
  async request<T>(opts: RequestOptions): Promise<T> {
    // The attempt timeout stays armed until the body has been read: headers
    // alone do not finish a JSON request, and a stalled body must not hang.
    const { res, release, timedOut, timeoutMs } = await this.send(opts, true);
    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      if (opts.signal?.aborted) throw abortReason(opts.signal);
      if (timedOut()) {
        throw new DosyaTimeoutError(`${opts.method} ${opts.path} timed out after ${timeoutMs}ms`, timeoutMs, { cause: err });
      }
      throw new DosyaNetworkError(`${opts.method} ${opts.path} failed while reading the response`, { cause: err });
    } finally {
      release();
    }

    let json: unknown;
    try {
      json = text === "" ? {} : JSON.parse(text);
    } catch {
      throw this.apiError(res, opts, `Invalid JSON response: ${text.slice(0, 200)}`, text);
    }

    const envelope = opts.envelope ?? true;
    if (!isPlainObject(json)) {
      if (envelope) throw this.apiError(res, opts, "Unexpected response shape", json);
      return convertKeys(json, snakeToCamel) as T;
    }

    if (envelope && json.ok !== true) {
      throw this.apiError(res, opts, typeof json.error === "string" ? json.error : "Unknown error", json);
    }

    const { ok: _ok, ...payload } = json;
    return convertKeys(payload, snakeToCamel) as T;
  }

  /**
   * Request whose body the caller reads itself (binary, streams, redirects).
   * Error statuses (>= 400) still throw DosyaApiError with the parsed body.
   */
  async requestRaw(opts: RequestOptions): Promise<Response> {
    const { res } = await this.send(opts, false);
    return res;
  }

  buildUrl(path: string, query?: Record<string, QueryValue>): string {
    if (!path.startsWith("/")) throw new TypeError(`Path must start with "/": ${path}`);
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value != null && value !== "") {
          url.searchParams.set(camelToSnake(key), String(value));
        }
      }
    }
    return url.toString();
  }

  /** Sleep that the caller's signal can cut short. */
  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortReason(signal));
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortReason(signal!));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  backoff(attempt: number): number {
    const delay = this.baseDelay * 2 ** attempt;
    const jitter = delay * 0.2 * Math.random();
    return Math.min(delay + jitter, this.maxDelay);
  }

  // ── Private ──

  /**
   * Run the request with retries. With `holdTimeout` the successful attempt's
   * timeout keeps running until the caller calls `release()` (after reading the
   * body); otherwise it stops once headers arrive, so streams are not cut off.
   */
  private async send(
    opts: RequestOptions,
    holdTimeout: boolean,
  ): Promise<{ res: Response; release: () => void; timedOut: () => boolean; timeoutMs: number }> {
    const url = this.buildUrl(opts.path, opts.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...opts.headers,
    };

    let body: BodyInit | undefined;
    if (opts.rawBody !== undefined) {
      body = opts.rawBody;
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(convertKeys(opts.body, camelToSnake));
    }

    const policy = opts.retry ?? "auto";
    const maxRetries = policy === "never" ? 0 : this.maxRetries;
    const idempotent = policy === "always" || IDEMPOTENT.has(opts.method);
    const timeoutMs = opts.timeout ?? this.timeout;

    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < maxRetries;
      if (this.readYourWrites && this.bookmark) headers[BOOKMARK_HEADER] = this.bookmark;

      this.debugFn?.(`${opts.method} ${url} (attempt ${attempt + 1}/${maxRetries + 1})`);
      const { signal, timedOut, dispose } = attemptSignal(opts.signal, timeoutMs);

      let res: Response;
      try {
        res = await this.fetchFn(url, {
          method: opts.method,
          headers,
          body,
          signal,
          redirect: opts.manualRedirect ? "manual" : "follow",
        });
      } catch (err) {
        dispose();
        if (opts.signal?.aborted) throw abortReason(opts.signal);
        if (timedOut()) {
          if (canRetry && idempotent) {
            this.debugFn?.(`Timed out after ${timeoutMs}ms, retrying`);
            await this.sleep(this.backoff(attempt), opts.signal);
            continue;
          }
          throw new DosyaTimeoutError(
            `${opts.method} ${opts.path} timed out after ${timeoutMs}ms`,
            timeoutMs,
            { cause: err },
          );
        }
        if (canRetry && idempotent) {
          const delay = this.backoff(attempt);
          this.debugFn?.(`Request error: ${err instanceof Error ? err.message : String(err)}, retrying in ${Math.round(delay)}ms`);
          await this.sleep(delay, opts.signal);
          continue;
        }
        throw new DosyaNetworkError(
          `${opts.method} ${opts.path} failed after ${attempt + 1} attempt${attempt === 0 ? "" : "s"}`,
          { cause: err },
        );
      }
      this.debugFn?.(`${opts.method} ${url} → ${res.status}`);
      this.trackBookmark(res);
      this.extractRateLimit(res);

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = parseRetryAfter(res.headers.get("Retry-After"));
        const delay = this.retryDelay(res.status, retryAfter, idempotent, attempt);
        if (canRetry && delay !== null) {
          dispose();
          this.debugFn?.(`HTTP ${res.status}, retrying in ${Math.round(delay)}ms`);
          await res.body?.cancel().catch(() => {});
          await this.sleep(delay, opts.signal);
          continue;
        }
      }

      if (res.status >= 400) {
        try {
          throw await this.errorFromResponse(res, opts);
        } finally {
          dispose();
        }
      }
      // The caller's own signal still aborts a body read after this point.
      if (!holdTimeout) dispose();
      return { res, release: dispose, timedOut, timeoutMs };
    }
  }

  /** Milliseconds to wait before retrying, or null when this response must not be retried. */
  private retryDelay(
    status: number,
    retryAfter: number | undefined,
    idempotent: boolean,
    attempt: number,
  ): number | null {
    if (retryAfter !== undefined) {
      const ms = retryAfter * 1000;
      // Asked to wait longer than we are willing to: surface the error instead.
      if (ms > this.maxDelay) return null;
      // Rate-limit 429s are issued before the handler runs, so any method may
      // repeat. A 503 can come from inside a handler (a workspace moving
      // mid-request), so only idempotent methods repeat on it.
      if (status === 429 || idempotent) return ms;
      return null;
    }
    // A 429 without Retry-After is a business limit (daily caps) that will not clear by waiting.
    if (status === 429) return null;
    return idempotent ? this.backoff(attempt) : null;
  }

  private async errorFromResponse(res: Response, opts: RequestOptions): Promise<DosyaApiError> {
    let text = "";
    try {
      text = await res.text();
    } catch {
      // Body unreadable; fall through with an empty one.
    }
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      // Not JSON (e.g. an HTML error page from a proxy).
    }
    const message = isPlainObject(parsed) && typeof parsed.error === "string"
      ? parsed.error
      : `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
    return this.apiError(res, opts, message, parsed);
  }

  private apiError(res: Response, opts: RequestOptions, message: string, raw: unknown): DosyaApiError {
    return new DosyaApiError(res.status, message, raw, {
      code: isPlainObject(raw) ? machineCode(raw) : undefined,
      retryAfter: parseRetryAfter(res.headers.get("Retry-After")),
      method: opts.method,
      path: opts.path,
    });
  }

  private trackBookmark(res: Response): void {
    const value = res.headers.get(BOOKMARK_HEADER);
    // Bookmarks sort lexically by commit position; never move backwards.
    if (value && (!this.bookmark || value.localeCompare(this.bookmark) > 0)) {
      this.bookmark = value;
    }
  }

  private extractRateLimit(res: Response): void {
    if (!this.onRateLimit) return;
    const limit = res.headers.get("X-RateLimit-Limit");
    const remaining = res.headers.get("X-RateLimit-Remaining");
    const reset = res.headers.get("X-RateLimit-Reset");
    if (limit && remaining && reset) {
      this.onRateLimit({
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        resetAt: parseInt(reset, 10),
      });
    }
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

/**
 * One signal per attempt: aborts when the caller aborts or when this attempt's
 * timeout fires. `dispose` stops the timer only - the caller's signal stays
 * linked so it can still cancel a body that is being read.
 */
function attemptSignal(
  user: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; timedOut: () => boolean; dispose: () => void } {
  const timeout = new AbortController();
  let didTimeOut = false;

  const timer = timeoutMs > 0 && Number.isFinite(timeoutMs)
    ? setTimeout(() => {
        didTimeOut = true;
        timeout.abort(new DOMException(`Timed out after ${timeoutMs}ms`, "TimeoutError"));
      }, timeoutMs)
    : undefined;

  return {
    signal: user ? anySignal([user, timeout.signal]) : timeout.signal,
    timedOut: () => didTimeOut,
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const native = (AbortSignal as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (native) return native(signals);

  // Fallback for runtimes without AbortSignal.any (Node < 20.3).
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      return controller.signal;
    }
  }
  const onAbort = (e: Event) => {
    controller.abort((e.target as AbortSignal).reason);
    for (const s of signals) s.removeEventListener("abort", onAbort);
  };
  for (const s of signals) s.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}
