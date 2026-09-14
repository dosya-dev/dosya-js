export class DosyaError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DosyaError";
  }
}

export interface DosyaApiErrorOptions {
  /** Machine-readable code when the API sent one (e.g. `folder_locked`, `version_conflict`, `quota`). */
  code?: string;
  /** Seconds the API asked the caller to wait (`Retry-After`). */
  retryAfter?: number;
  method?: string;
  path?: string;
}

/** The API answered with an error (`{ ok: false, error, ...details }`) or a non-2xx status. */
export class DosyaApiError extends DosyaError {
  readonly status: number;
  /** The API's `error` string. */
  readonly errorMessage: string;
  readonly code?: string;
  readonly retryAfter?: number;
  readonly method?: string;
  readonly path?: string;
  /** Extra fields the API spread into the error body (e.g. `folder_id`, `current_version`). */
  readonly details: Record<string, unknown>;
  /** The full parsed error body, or the raw text when it was not JSON. */
  readonly raw: unknown;

  constructor(
    status: number,
    errorMessage: string,
    raw?: unknown,
    options: DosyaApiErrorOptions = {},
  ) {
    super(`[${status}] ${errorMessage}`);
    this.name = "DosyaApiError";
    this.status = status;
    this.errorMessage = errorMessage;
    this.raw = raw;
    this.code = options.code;
    this.retryAfter = options.retryAfter;
    this.method = options.method;
    this.path = options.path;

    const details: Record<string, unknown> = {};
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (k !== "ok" && k !== "error") details[k] = v;
      }
    }
    this.details = details;
  }
}

/** The request never produced a response (DNS, connection reset, offline). */
export class DosyaNetworkError extends DosyaError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DosyaNetworkError";
  }
}

/** An attempt exceeded its timeout and no retry was allowed or left. */
export class DosyaTimeoutError extends DosyaNetworkError {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DosyaTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class DosyaUploadError extends DosyaError {
  readonly sessionId: string;
  readonly partNumber?: number;

  constructor(message: string, sessionId: string, partNumber?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DosyaUploadError";
    this.sessionId = sessionId;
    this.partNumber = partNumber;
  }
}

/** A webhook delivery failed signature verification. */
export class DosyaWebhookSignatureError extends DosyaError {
  constructor(message: string) {
    super(message);
    this.name = "DosyaWebhookSignatureError";
  }
}
