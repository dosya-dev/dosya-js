// ── Client options ──

export interface DosyaClientOptions {
  /** API key (`dos_...`). Create one in the dosya.dev web app under Settings → API keys. */
  apiKey: string;
  /** API origin. Defaults to `https://api.dosya.dev`. Paths already carry `/api/...`. */
  baseUrl?: string;
  /** Custom fetch implementation (tests, proxies, older runtimes). */
  fetch?: typeof globalThis.fetch;
  retry?: RetryOptions;
  /** Per-attempt timeout in milliseconds for JSON requests. Default 30 000. */
  timeout?: number;
  /**
   * Per-attempt timeout in milliseconds for requests that carry file bytes
   * (single-request uploads, multipart parts, batch uploads). Default 600 000.
   */
  uploadTimeout?: number;
  /**
   * Echo the `X-D1-Bookmark` header from the latest response on subsequent
   * requests, so a read right after a write never lands on a stale replica.
   * Default true.
   */
  readYourWrites?: boolean;
  onRateLimit?: (info: RateLimitInfo) => void;
  debug?: (message: string) => void;
}

export interface RetryOptions {
  /** Retries after the first attempt. Default 3. */
  maxRetries?: number;
  /** First backoff delay in milliseconds. Default 500. */
  baseDelay?: number;
  /**
   * Longest the client will sleep before a retry, in milliseconds. A 429 or 503
   * whose `Retry-After` asks for longer is surfaced as an error instead.
   * Default 30 000.
   */
  maxDelay?: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  /** Unix seconds. */
  resetAt: number;
}

// ── Pagination ──

export interface PaginationMeta {
  page: number;
  perPage: number;
  totalFiles: number;
  totalPages: number;
}

// ── Lock / Hide ──

export type LockMode = "none" | "view_only" | "full_lock";

export type HiddenMode = "none" | "everyone" | "users" | "roles";

export interface LockInfo {
  lockMode: LockMode;
  lockedBy: string | null;
  lockedByName: string | null;
  lockedAt: number | null;
}

export interface SetLockParams {
  /** `"none"` removes the lock. */
  lockMode: LockMode;
  /** Required for `full_lock`. When given, at least 4 characters for any mode; not used by `view_only`. */
  password?: string;
}

export type SetHideParams =
  | { hiddenMode: "none" | "everyone" }
  | { hiddenMode: "users" | "roles"; /** User ids or role ids. */ targets: string[] };

export interface HideInfo {
  isHidden: boolean;
  hiddenMode: HiddenMode;
  rules: Array<{ targetType: "user" | "role"; targetId: string }>;
}

/** Result of unlocking a `full_lock` item with its password. */
export interface UnlockGrant {
  /** Pass as `unlockToken` to download/raw/thumbnail calls. Valid for one hour. */
  unlockToken: string;
  expiresAt: number;
}

// ── HTTP internals ──

export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method: HttpMethod;
  path: string;
  /** JSON body. camelCase keys are sent as snake_case. */
  body?: unknown;
  /** Body sent verbatim (bytes, FormData). Takes precedence over `body`. */
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  /** camelCase keys are sent as snake_case; null/undefined/"" values are dropped. */
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /**
   * When to retry.
   * - `"auto"` (default): 429 and 503 with `Retry-After` for every method; other
   *   5xx, timeouts and network errors only for GET/HEAD/PUT/DELETE.
   * - `"never"`: a single attempt.
   * - `"always"`: every retryable failure for every method.
   */
  retry?: "auto" | "never" | "always";
  /** Per-attempt timeout override in milliseconds. */
  timeout?: number;
  /**
   * Whether a success response carries the `{ ok: true, ... }` envelope.
   * Default true. Set false for the few endpoints that answer bare JSON.
   */
  envelope?: boolean;
  /** Do not follow redirects (the Response is returned as-is). */
  manualRedirect?: boolean;
}
