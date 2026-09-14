import { describe, it, expect } from "vitest";
import { mockApi, ok, fail } from "./_mock.js";
import { WebhooksResource } from "../../src/resources/webhooks.js";
import { WEBHOOK_EVENT_TYPES } from "../../src/types/webhooks.js";

const row = {
  id: "whep_1", workspace_id: "ws_1", url: "https://hooks.example.com/in", events: ["file.uploaded"],
  description: null, active: 1, consecutive_failures: 0, disabled_at: null,
  created_by: "usr_1", created_at: 1700000000, updated_at: 1700000000,
};

describe("WebhooksResource", () => {
  it("exports the event type list", () => {
    expect(WEBHOOK_EVENT_TYPES).toEqual(["file.uploaded", "file.deleted", "share.accessed"]);
  });

  it("list() GETs with workspace_id and camelCases rows", async () => {
    const api = mockApi({ "GET /api/webhooks": ok({ webhooks: [row] }) });
    const { webhooks } = await new WebhooksResource(api.http()).list("ws_1");
    expect(api.calls[0].method).toBe("GET");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    expect(webhooks[0]).toEqual({
      id: "whep_1", workspaceId: "ws_1", url: "https://hooks.example.com/in", events: ["file.uploaded"],
      description: null, active: 1, consecutiveFailures: 0, disabledAt: null,
      createdBy: "usr_1", createdAt: 1700000000, updatedAt: 1700000000,
    });
  });

  it("create() POSTs snake_case body and returns the secret", async () => {
    const api = mockApi({
      "POST /api/webhooks": ok({
        webhook: {
          id: "whep_1", workspace_id: "ws_1", url: "https://h.example/x", events: ["file.uploaded", "file.deleted"],
          description: "d", active: 1, secret: "whsec_abc", created_at: 1700000000,
        },
      }, 201),
    });
    const res = await new WebhooksResource(api.http()).create({
      workspaceId: "ws_1", url: "https://h.example/x", events: ["file.uploaded", "file.deleted"], description: "d",
    });
    expect(api.calls[0].method).toBe("POST");
    expect(api.calls[0].body).toEqual({
      workspace_id: "ws_1", url: "https://h.example/x", events: ["file.uploaded", "file.deleted"], description: "d",
    });
    expect(res.webhook.secret).toBe("whsec_abc");
    expect(res.webhook.workspaceId).toBe("ws_1");
    expect(res.webhook.createdAt).toBe(1700000000);
  });

  it("create() omits description when not given and is not retried on 5xx", async () => {
    const api = mockApi({ "POST /api/webhooks": [fail(500, "boom"), ok({ webhook: {} })] });
    const http = api.http({ retry: { maxRetries: 3, baseDelay: 1, maxDelay: 50 } });
    await expect(
      new WebhooksResource(http).create({ workspaceId: "ws_1", url: "https://h.example/x", events: ["file.deleted"] }),
    ).rejects.toMatchObject({ status: 500 });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].body).toEqual({ workspace_id: "ws_1", url: "https://h.example/x", events: ["file.deleted"] });
  });

  it("get() encodes the id and returns health fields", async () => {
    const api = mockApi({
      "GET /api/webhooks/whep%2F1": ok({ webhook: { ...row, first_failure_at: 1700000100, health_notified: 0 } }),
    });
    const { webhook } = await new WebhooksResource(api.http()).get("whep/1");
    expect(api.calls[0].path).toBe("/api/webhooks/whep%2F1");
    expect(webhook.firstFailureAt).toBe(1700000100);
    expect(webhook.healthNotified).toBe(0);
  });

  it("get() rejects an empty id before any request", async () => {
    const api = mockApi();
    await expect(new WebhooksResource(api.http()).get("")).rejects.toBeInstanceOf(TypeError);
    expect(api.calls).toHaveLength(0);
  });

  it("update() PATCHes only the given fields and resolves void", async () => {
    const api = mockApi({ "PATCH /api/webhooks/whep_1": ok() });
    const res = await new WebhooksResource(api.http()).update("whep_1", { active: true, events: ["share.accessed"] });
    expect(res).toBeUndefined();
    expect(api.calls[0].method).toBe("PATCH");
    expect(api.calls[0].body).toEqual({ active: true, events: ["share.accessed"] });
  });

  it("delete() DELETEs the endpoint", async () => {
    const api = mockApi({ "DELETE /api/webhooks/whep_1": ok() });
    await expect(new WebhooksResource(api.http()).delete("whep_1")).resolves.toBeUndefined();
    expect(api.calls[0].method).toBe("DELETE");
  });

  it("rollSecret() POSTs and returns the new secret", async () => {
    const api = mockApi({ "POST /api/webhooks/whep_1/roll-secret": ok({ secret: "whsec_new" }) });
    const res = await new WebhooksResource(api.http()).rollSecret("whep_1");
    expect(api.calls[0].method).toBe("POST");
    expect(api.calls[0].body).toBeUndefined();
    expect(res).toEqual({ secret: "whsec_new" });
  });

  it("test() returns the delivery id", async () => {
    const api = mockApi({ "POST /api/webhooks/whep_1/test": ok({ delivery_id: "whd_1" }) });
    const res = await new WebhooksResource(api.http()).test("whep_1");
    expect(api.calls[0].method).toBe("POST");
    expect(res).toEqual({ deliveryId: "whd_1" });
  });

  it("listDeliveries() sends page/per_page and camelCases rows and pagination", async () => {
    const api = mockApi({
      "GET /api/webhooks/whep_1/deliveries": ok({
        deliveries: [{
          id: "whd_1", event_id: "evt_1", event_type: "file.deleted", status: "failed", attempts: 6,
          next_attempt_at: null, last_attempt_at: 1700000000, response_status: 500,
          response_snippet: "nope", error: null, created_at: 1699999000,
        }],
        pagination: { page: 2, per_page: 10, total: 11, total_pages: 2 },
      }),
    });
    const res = await new WebhooksResource(api.http()).listDeliveries("whep_1", { page: 2, perPage: 10 });
    expect(api.calls[0].query).toEqual({ page: "2", per_page: "10" });
    expect(res.deliveries[0]).toEqual({
      id: "whd_1", eventId: "evt_1", eventType: "file.deleted", status: "failed", attempts: 6,
      nextAttemptAt: null, lastAttemptAt: 1700000000, responseStatus: 500,
      responseSnippet: "nope", error: null, createdAt: 1699999000,
    });
    expect(res.pagination).toEqual({ page: 2, perPage: 10, total: 11, totalPages: 2 });
  });

  it("listDeliveries() sends no query by default", async () => {
    const api = mockApi({
      "GET /api/webhooks/whep_1/deliveries": ok({ deliveries: [], pagination: { page: 1, per_page: 25, total: 0, total_pages: 1 } }),
    });
    await new WebhooksResource(api.http()).listDeliveries("whep_1");
    expect(api.calls[0].query).toEqual({});
  });

  it("redeliver() encodes both ids and returns the new delivery id", async () => {
    const api = mockApi({ "POST /api/webhooks/whep_1/deliveries/whd%3F1/redeliver": ok({ delivery_id: "whd_2" }) });
    const res = await new WebhooksResource(api.http()).redeliver("whep_1", "whd?1");
    expect(api.calls[0].method).toBe("POST");
    expect(api.calls[0].path).toBe("/api/webhooks/whep_1/deliveries/whd%3F1/redeliver");
    expect(res).toEqual({ deliveryId: "whd_2" });
  });

  it("surfaces the full-scope guard as a DosyaApiError", async () => {
    const api = mockApi({ "GET /api/webhooks": fail(403, "API key scope 'full' required") });
    await expect(new WebhooksResource(api.http()).list("ws_1")).rejects.toMatchObject({
      status: 403, errorMessage: "API key scope 'full' required",
    });
  });
});
