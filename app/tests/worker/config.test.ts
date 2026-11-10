import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import worker from "../../worker/src/index";
describe("runtime configuration", () => {
  it("exposes public verification settings without service secrets", async () => {
    const r = await SELF.fetch("https://app.test/api/config");
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect(b).toMatchObject({ verificationRequired: false });
    expect(b.turnstileSiteKey).toBeTruthy();
    expect(JSON.stringify(b)).not.toContain(env.SESSION_SECRET);
    expect(JSON.stringify(b)).not.toContain("TURNSTILE_SECRET");
  });
  it("rejects local bypass configuration on a non-loopback hostname", async () => {
    const r = await worker.fetch(
      new Request("https://public.example/api/health"),
      { ...env, APP_ENV: "local" },
    );
    expect(r.status).toBe(503);
  });
});
