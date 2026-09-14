import { describe, it, expect } from "vitest";
import { mockApi, ok } from "./_mock.js";
import { RegionsResource } from "../../src/resources/regions.js";

describe("RegionsResource", () => {
  it("list() returns regions and the suggested code", async () => {
    const region = { code: "ap-southeast-2", city: "Sydney", country: "Australia", continent: "Oceania", flag: "AU" };
    const api = mockApi({ "GET /api/regions": ok({ regions: [region], suggested: "ap-southeast-2" }) });
    const res = await new RegionsResource(api.http()).list();
    expect(api.calls[0].method).toBe("GET");
    expect(res).toEqual({ regions: [region], suggested: "ap-southeast-2" });
  });
});
