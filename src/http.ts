import { DosyaApiError, DosyaNetworkError } from "./errors.js";
import type { DosyaClientOptions, RateLimitInfo, RequestOptions } from "./types.js";

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function convertKeys(obj: unknown, fn: (key: string) => string): unknown {
  if (Array.isArray(obj)) return obj.map((v) => convertKeys(v, fn));
  if (obj !== null && typeof obj === "object" && !(obj instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[fn(k)] = convertKeys(v, fn);
    }
    return out;
  }
  return obj;
}

export class HttpClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly maxRetries: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly onRateLimit?: (info: RateLimitInfo) => void;

  constructor(options: DosyaClientOptions) {
    this.baseUrl = (options.baseUrl ?? "https://dosya.dev").replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxRetries = options.retry?.maxRetries ?? 3;
    this.baseDelay = options.retry?.baseDelay ?? 500;
    this.maxDelay = options.retry?.maxDelay ?? 30_000;
    this.onRateLimit = options.onRateLimit;
  }

  async request<T>(opts: RequestOptions): Promise<T> {
    const res = await this.doFetch(opts);

    if (opts.rawResponse) {
      return res as unknown as T;
    }

    const text = await res.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text);
    } catch {
      throw new DosyaApiError(res.status, `Invalid JSON response: ${text.slice(0, 200)}`);
    }

    if (!json.ok) {
      throw new DosyaApiError(
        res.status,
        (json.error as string) ?? "Unknown error",
        json,
      );
    }

    const { ok: _, ...payload } = json;
    return convertKeys(payload, snakeToCamel) as T;
  }

  async requestRaw(opts: RequestOptions): Promise<Response> {
    return this.doFetch(opts);
  }

  private async doFetch(opts: RequestOptions): Promise<Response> {
    const url = this.buildUrl(opts.path, opts.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...opts.headers,
    };

    let fetchBody: BodyInit | undefined;

    if (opts.rawBody !== undefined) {
      fetchBody = opts.rawBody;
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      fetchBody = JSON.stringify(convertKeys(opts.body, camelToSnake));
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchFn(url, {
          method: opts.method,
          headers,
          body: fetchBody,
          signal: opts.signal,
          redirect: opts.rawResponse ? "manual" : "follow",
        });

        this.extractRateLimit(res);

        if (res.status === 429) {
          const retryAfter = res.headers.get("Retry-After");
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : this.getDelay(attempt);

          if (attempt < this.maxRetries) {
            await this.sleep(delay);
            continue;
          }
        }

        if (res.status >= 500 && attempt < this.maxRetries) {
          await this.sleep(this.getDelay(attempt));
          continue;
        }

        return res;
      } catch (err) {
        lastError = err;
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        if (attempt < this.maxRetries) {
          await this.sleep(this.getDelay(attempt));
          continue;
        }
      }
    }

    throw new DosyaNetworkError(
      `Request to ${opts.method} ${opts.path} failed after ${this.maxRetries + 1} attempts`,
      { cause: lastError },
    );
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | null | undefined>,
  ): string {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value != null && value !== "") {
          url.searchParams.set(camelToSnake(key), String(value));
        }
      }
    }
    return url.toString();
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

  private getDelay(attempt: number): number {
    const delay = this.baseDelay * 2 ** attempt;
    const jitter = delay * 0.2 * Math.random();
    return Math.min(delay + jitter, this.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
