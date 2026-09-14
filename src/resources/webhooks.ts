import { seg, type HttpClient } from "../http.js";
import type {
  WebhookEndpoint,
  WebhookEndpointDetail,
  CreatedWebhookEndpoint,
  CreateWebhookParams,
  UpdateWebhookParams,
  ListWebhookDeliveriesParams,
  WebhookDeliveriesResponse,
} from "../types/webhooks.js";

/**
 * Outbound webhook endpoints. Every method (GETs included) needs a `full` scope
 * key and a role with the `manage_settings` permission in the endpoint's
 * workspace. Workspace-pinned keys can only call `list()`; every other method
 * answers 403 for them.
 */
export class WebhooksResource {
  constructor(private readonly http: HttpClient) {}

  /** List a workspace's endpoints, newest first (max 16, not paginated). Secrets are never included. */
  async list(workspaceId: string): Promise<{ webhooks: WebhookEndpoint[] }> {
    return this.http.request({
      method: "GET",
      path: "/api/webhooks",
      query: { workspace_id: workspaceId },
    });
  }

  /**
   * Register an endpoint. The `secret` in the result is shown only here - store it.
   * Limits: 16 endpoints per workspace (400); free plan 3 endpoints in total across
   * all workspaces (403). The URL must be public `https://` (400 otherwise).
   * Not retried automatically (a replay would create a second endpoint).
   */
  async create(params: CreateWebhookParams): Promise<{ webhook: CreatedWebhookEndpoint }> {
    return this.http.request({
      method: "POST",
      path: "/api/webhooks",
      body: {
        workspaceId: params.workspaceId,
        url: params.url,
        events: params.events,
        description: params.description,
      },
    });
  }

  /** Get one endpoint, including failure-health fields. 404 `Webhook not found`. */
  async get(id: string): Promise<{ webhook: WebhookEndpointDetail }> {
    return this.http.request({
      method: "GET",
      path: `/api/webhooks/${seg(id)}`,
    });
  }

  /**
   * Change an endpoint. Only the fields given are updated. `active: true`
   * re-enables an auto-disabled endpoint and resets its failure counter.
   * Resolves with nothing; call `get()` for the new state.
   */
  async update(id: string, params: UpdateWebhookParams): Promise<void> {
    await this.http.request({
      method: "PATCH",
      path: `/api/webhooks/${seg(id)}`,
      body: {
        url: params.url,
        events: params.events,
        active: params.active,
        description: params.description,
      },
    });
  }

  /** Delete an endpoint and its whole delivery log. */
  async delete(id: string): Promise<void> {
    await this.http.request({
      method: "DELETE",
      path: `/api/webhooks/${seg(id)}`,
      retry: "never",
    });
  }

  /**
   * Replace the signing secret and return the new one (shown only here). The old
   * secret stops verifying IMMEDIATELY - there is no grace period, so deliveries
   * fail until your receiver has the new value. Rate limited to 10 per hour per user.
   */
  async rollSecret(id: string): Promise<{ secret: string }> {
    return this.http.request({
      method: "POST",
      path: `/api/webhooks/${seg(id)}/roll-secret`,
    });
  }

  /**
   * Send a synthetic `file.uploaded` event (`data.test: true`) to the endpoint now,
   * even if it is inactive or not subscribed to that event. Check the outcome with
   * `listDeliveries()`. Rate limited to 20 per 5 minutes per user.
   */
  async test(id: string): Promise<{ deliveryId: string }> {
    return this.http.request({
      method: "POST",
      path: `/api/webhooks/${seg(id)}/test`,
    });
  }

  /** Page through an endpoint's delivery log, newest first. `perPage` is clamped to 10..100. */
  async listDeliveries(id: string, params: ListWebhookDeliveriesParams = {}): Promise<WebhookDeliveriesResponse> {
    return this.http.request({
      method: "GET",
      path: `/api/webhooks/${seg(id)}/deliveries`,
      query: { page: params.page, per_page: params.perPage },
    });
  }

  /**
   * Re-send a past delivery's exact payload as a new delivery (new `deliveryId`,
   * same event id). 404 `Delivery not found`. Rate limited to 20 per 5 minutes per user.
   */
  async redeliver(id: string, deliveryId: string): Promise<{ deliveryId: string }> {
    return this.http.request({
      method: "POST",
      path: `/api/webhooks/${seg(id)}/deliveries/${seg(deliveryId)}/redeliver`,
    });
  }
}
