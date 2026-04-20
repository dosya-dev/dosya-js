export class DosyaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DosyaError";
  }
}

export class DosyaApiError extends DosyaError {
  readonly status: number;
  readonly errorMessage: string;
  readonly raw: unknown;

  constructor(status: number, errorMessage: string, raw?: unknown) {
    super(`[${status}] ${errorMessage}`);
    this.name = "DosyaApiError";
    this.status = status;
    this.errorMessage = errorMessage;
    this.raw = raw;
  }
}

export class DosyaNetworkError extends DosyaError {
  readonly cause: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "DosyaNetworkError";
    this.cause = options?.cause;
  }
}

export class DosyaUploadError extends DosyaError {
  readonly sessionId: string;
  readonly partNumber?: number;

  constructor(message: string, sessionId: string, partNumber?: number) {
    super(message);
    this.name = "DosyaUploadError";
    this.sessionId = sessionId;
    this.partNumber = partNumber;
  }
}
