import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../../worker/src/index";
describe("health", () => {
  it("serves the configured application health endpoint", async () => {
    const r = await SELF.fetch("https://app.test/api/health");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
  it("returns JSON 404 for missing API without falling back to SPA", async () => {
    const r = await SELF.fetch("https://app.test/api/does-not-exist");
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(await r.json()).toMatchObject({ code: "not_found" });
  });
  it("reports missing configuration without leaking secrets", async () => {
    const r = await worker.fetch(new Request("https://app.test/api/health"), {
      ...env,
      DB: undefined,
    } as never);
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ code: "configuration_missing" });
  });
});
