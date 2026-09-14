/** Every event type a webhook endpoint can subscribe to. */
export const WEBHOOK_EVENT_TYPES = ["file.uploaded", "file.deleted", "share.accessed"] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** A webhook endpoint as listed by `GET /api/webhooks`. The signing secret is never included. */
export interface WebhookEndpoint {
  /** `whep_...` */
  id: string;
  workspaceId: string;
  url: string;
  events: WebhookEventType[];
  description: string | null;
  /** `1` active, `0` disabled (by `update({active:false})` or auto-disabled after 15 consecutive failures). */
  active: 0 | 1;
  consecutiveFailures: number;
  /** Unix seconds when the endpoint was auto-disabled; cleared when re-activated. */
  disabledAt: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

/** A single endpoint from `GET /api/webhooks/:id`, which also carries health bookkeeping. */
export interface WebhookEndpointDetail extends WebhookEndpoint {
  /** Unix seconds of the first failure in the current run of failures. */
  firstFailureAt: number | null;
  /** `0` healthy, `1` failure warning sent, `2` auto-disabled notice sent. */
  healthNotified: 0 | 1 | 2;
}

/** Returned once by `create()`; `secret` is never shown again (use `rollSecret()` to replace it). */
export interface CreatedWebhookEndpoint
  extends Pick<WebhookEndpoint, "id" | "workspaceId" | "url" | "events" | "description" | "active" | "createdAt"> {
  /** `whsec_...` signing secret. Store it now. */
  secret: string;
}

export interface CreateWebhookParams {
  workspaceId: string;
  /** Public `https://` URL. Private, loopback and non-https targets are refused (400). */
  url: string;
  /** Non-empty; duplicates are collapsed. */
  events: WebhookEventType[];
  description?: string;
}

export interface UpdateWebhookParams {
  url?: string;
  events?: WebhookEventType[];
  /** `true` re-enables an auto-disabled endpoint and resets its failure counter. */
  active?: boolean;
  /** `null` clears it. */
  description?: string | null;
}

export interface ListWebhookDeliveriesParams {
  /** 1-based, default 1. */
  page?: number;
  /** Clamped by the API to 10..100, default 25. */
  perPage?: number;
}

export type WebhookDeliveryStatus = "pending" | "success" | "failed";

/** One delivery attempt row. The payload body is not returned. */
export interface WebhookDelivery {
  /** `whd_...` */
  id: string;
  /** `evt_...`, stable across retries and redeliveries. */
  eventId: string;
  eventType: WebhookEventType;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: number | null;
  lastAttemptAt: number | null;
  responseStatus: number | null;
  /** First 500 characters of the receiver's response body. */
  responseSnippet: string | null;
  error: string | null;
  createdAt: number;
}

export interface WebhookDeliveriesPagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface WebhookDeliveriesResponse {
  deliveries: WebhookDelivery[];
  pagination: WebhookDeliveriesPagination;
}

// ── Delivered events ──
// These arrive at YOUR server as raw JSON and are typed exactly as sent
// (snake_case). The SDK never camelCases them.

interface WebhookEventBase<T extends WebhookEventType, D> {
  /** `evt_...`; use it for idempotency (identical across retries and redeliveries). */
  id: string;
  type: T;
  /** Unix seconds when the event happened (not the delivery attempt time). */
  created: number;
  workspace_id: string;
  data: D;
}

export interface FileUploadedEventData {
  file_id: string;
  name: string;
  size: number;
  folder_id: string | null;
  version: number;
  is_new_version: boolean;
  /** Present only on the synthetic event sent by `webhooks.test()`. */
  test?: true;
}

export interface FileDeletedEventData {
  file_id: string;
  name: string;
  /** `false` moved to trash, `true` purged. */
  permanent: boolean;
}

/**
 * `share.accessed` payloads. They contain the public share `token`, which grants
 * access to the link - treat webhook bodies as secrets.
 */
export type ShareAccessedEventData =
  | { share_id: string; token: string; file_id: string | null; folder_id: string | null; access_type: "view" }
  | { share_id: string; token: string; file_id: string; access_type: "download" }
  | { share_id: string; token: string; folder_id: string; access_type: "download_all" };

export type FileUploadedEvent = WebhookEventBase<"file.uploaded", FileUploadedEventData>;
export type FileDeletedEvent = WebhookEventBase<"file.deleted", FileDeletedEventData>;
export type ShareAccessedEvent = WebhookEventBase<"share.accessed", ShareAccessedEventData>;

/** A delivered webhook event body, discriminated on `type`. */
export type WebhookEvent = FileUploadedEvent | FileDeletedEvent | ShareAccessedEvent;
