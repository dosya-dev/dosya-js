import { describe, it, expect } from "vitest";
import { mockApi, ok } from "./_mock.js";
import { SharesResource } from "../../src/resources/shares.js";

describe("SharesResource", () => {
  it("list() queries workspace_id and exposes linkId/sharedAt (regression: typed as id/createdAt)", async () => {
    const api = mockApi({
      "GET /api/shares": ok({
        links: [
          {
            link_id: "sl_1",
            token: "tok",
            expires_at: null,
            view_count: 4,
            download_count: 1,
            is_revoked: 0,
            revoked_at: null,
            shared_at: 100,
            created_by: "usr_1",
            folder_id: "fld_1",
            lock_mode: "none",
            is_bundle: 0,
            is_password_protected: 0,
            access_mode: "public",
            max_downloads: null,
            recipient_count: 0,
            file_id: null,
            file_name: null,
            size_bytes: null,
            extension: null,
            region: null,
            folder_name: "Docs",
            sharer_name: "A",
            status: "active",
            is_folder: true,
            display_name: "Docs",
            url: "https://dosya.dev/s/tok",
            is_mine: true,
          },
        ],
        stats: { total: 1, active: 1, expiring: 0, total_views: 4 },
      }),
    });
    const res = await new SharesResource(api.http()).list("ws_1");
    expect(api.calls[0].query).toEqual({ workspace_id: "ws_1" });
    const link = res.links[0];
    expect(link.linkId).toBe("sl_1");
    expect(link.sharedAt).toBe(100);
    expect(link.isFolder).toBe(true);
    expect(link.displayName).toBe("Docs");
    expect(link.fileId).toBeNull();
    expect(res.stats.totalViews).toBe(4);
  });

  it("update() PATCHes only the given fields, keeping null", async () => {
    const api = mockApi({
      "PATCH /api/shares/sl%2F1": ok({
        link: {
          link_id: "sl/1",
          expires_at: null,
          is_password_protected: 0,
          lock_mode: "none",
          access_mode: "restricted",
          recipient_count: 2,
          download_count: 0,
          max_downloads: 10,
        },
      }),
    });
    const res = await new SharesResource(api.http()).update("sl/1", {
      password: null,
      expiresInDays: null,
      accessMode: "restricted",
      recipientEmails: ["a@x.y", "b@x.y"],
      maxDownloads: 10,
    });
    expect(api.calls[0].method).toBe("PATCH");
    expect(api.calls[0].path).toBe("/api/shares/sl%2F1");
    expect(api.calls[0].body).toEqual({
      password: null,
      expires_in_days: null,
      access_mode: "restricted",
      recipient_emails: ["a@x.y", "b@x.y"],
      max_downloads: 10,
    });
    expect(res.link.recipientCount).toBe(2);
    expect(res.link.linkId).toBe("sl/1");
  });

  it("analytics() sends range/offset and camelCases the report", async () => {
    const api = mockApi({
      "GET /api/shares/sl_1/analytics": ok({
        link: { link_id: "sl_1", downloads_left: 3, status: "active" },
        range: 7,
        timeline: [{ day: "2026-09-01", opens: 1, downloads: 0 }],
        reach: { visitors: 1, truncated: false, devices: [{ label: "Desktop", count: 1 }], browsers: [] },
        recipients: null,
        log: { total: 1, offset: 25, limit: 25, rows: [{ id: "v1", visitor: "abcd1234", event: "view", device: "desktop", device_label: "Chrome", country: "AU", viewed_at: 5 }] },
        gaps: { repeat_visits: "x", per_recipient: null },
      }),
    });
    const res = await new SharesResource(api.http()).analytics("sl_1", { range: 7, offset: 25 });
    expect(api.calls[0].query).toEqual({ range: "7", offset: "25" });
    expect(res.link.downloadsLeft).toBe(3);
    expect(res.log.rows[0].deviceLabel).toBe("Chrome");
    expect(res.gaps.repeatVisits).toBe("x");
  });

  it("analytics() with no params sends no query", async () => {
    const api = mockApi({ "GET /api/shares/sl_1/analytics": ok({}) });
    await new SharesResource(api.http()).analytics("sl_1");
    expect(api.calls[0].query).toEqual({});
  });

  it("revoke() POSTs to revoke", async () => {
    const api = mockApi({ "POST /api/shares/sl_1/revoke": ok() });
    await new SharesResource(api.http()).revoke("sl_1");
    expect(api.calls[0].method).toBe("POST");
    expect(api.calls[0].path).toBe("/api/shares/sl_1/revoke");
  });

  it("withMe() returns links and verification state", async () => {
    const api = mockApi({
      "GET /api/shares/with-me": ok({
        links: [{ link_id: "sl_2", url: "u", display_name: "f.pdf", is_folder: false, verified_at: null, sender_name: "B" }],
        email_verified: true,
        stats: { total: 1, active: 1, unopened: 1 },
      }),
    });
    const res = await new SharesResource(api.http()).withMe();
    expect(res.emailVerified).toBe(true);
    expect(res.links[0].senderName).toBe("B");
    expect(res.stats?.unopened).toBe(1);
  });
});
