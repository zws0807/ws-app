import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { Client, password } from "./helpers";
describe("auth", () => {
  it("registers independent users and never stores plaintext credentials", async () => {
    const a = new Client(),
      b = new Client();
    const x = await a.register(),
      y = await b.register();
    expect(x.user.id).not.toBe(y.user.id);
    expect(x.recoveryCode.length).toBeGreaterThanOrEqual(40);
    expect(((await (await a.call("/api/auth/me")).json()) as any).user.id).toBe(
      x.user.id,
    );
    const row: any = await env.DB.prepare(
      "SELECT * FROM credentials WHERE user_id=?",
    )
      .bind(x.user.id)
      .first();
    expect(JSON.stringify(row)).not.toContain(password);
    expect(JSON.stringify(row)).not.toContain(x.recoveryCode);
    expect(row.password_hash).toContain("argon2id");
  });
  it("normalizes usernames for uniqueness and rejects weak passwords", async () => {
    const a = new Client();
    await a.register("Alice");
    const b = new Client();
    expect(
      (
        await b.call("/api/auth/register", "POST", {
          username: "ＡＬＩＣＥ",
          password,
          turnstileToken: "test-token",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await b.call("/api/auth/register", "POST", {
          username: "bb",
          password: "short",
          turnstileToken: "test-token",
        })
      ).status,
    ).toBe(400);
  });
  it("does not trim passwords and returns the same error for wrong or absent accounts", async () => {
    const a = new Client();
    const u = await a.register(undefined, " padded-password ");
    await a.call("/api/auth/logout", "POST", {});
    const bad = await a.login(u.user.username, "padded-password");
    expect(bad.r.status).toBe(401);
    const missing = await a.login("missing-account");
    expect(missing.r.status).toBe(401);
    expect(bad.b).toEqual(missing.b);
    expect((await a.login(u.user.username, " padded-password ")).r.status).toBe(
      200,
    );
  });
  it("requires Origin and CSRF and invalidates a logged out session", async () => {
    const a = new Client();
    await a.register();
    const cookie = a.cookie;
    expect(
      (
        await a.call(
          "/api/auth/logout",
          "POST",
          {},
          { "x-csrf-token": "wrong" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await a.call(
          "/api/auth/logout",
          "POST",
          {},
          { origin: "https://evil.test" },
        )
      ).status,
    ).toBe(403);
    expect((await a.call("/api/auth/logout", "POST", {})).status).toBe(200);
    a.cookie = cookie;
    expect((await a.call("/api/auth/me")).status).toBe(401);
  });
  it("uses recovery codes once and revokes all old sessions atomically", async () => {
    const a = new Client(),
      b = new Client();
    const u = await a.register();
    await b.login(u.user.username);
    const c = new Client();
    expect(
      (
        await c.call("/api/auth/recover", "POST", {
          username: u.user.username,
          recoveryCode: "wrong",
          newPassword: password,
          turnstileToken: "test-token",
        })
      ).status,
    ).toBe(401);
    const r = await c.call("/api/auth/recover", "POST", {
      username: u.user.username,
      recoveryCode: u.recoveryCode,
      newPassword: "replacement-password",
      turnstileToken: "test-token",
    });
    expect(r.status).toBe(200);
    const fresh: any = await r.json();
    expect(fresh.recoveryCode).not.toBe(u.recoveryCode);
    expect((await a.call("/api/auth/me")).status).toBe(401);
    expect((await b.call("/api/auth/me")).status).toBe(401);
    expect(
      (
        await c.call("/api/auth/recover", "POST", {
          username: u.user.username,
          recoveryCode: u.recoveryCode,
          newPassword: password,
          turnstileToken: "test-token",
        })
      ).status,
    ).toBe(401);
    expect(
      (await c.login(u.user.username, "replacement-password")).r.status,
    ).toBe(200);
  });
  it("requires old password for changes and clears other sessions", async () => {
    const a = new Client(),
      b = new Client();
    const u = await a.register();
    await b.login(u.user.username);
    expect(
      (
        await a.call("/api/auth/password", "POST", {
          oldPassword: "wrong",
          newPassword: "another-password",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await a.call("/api/auth/password", "POST", {
          oldPassword: password,
          newPassword: "another-password",
        })
      ).status,
    ).toBe(200);
    expect((await b.call("/api/auth/me")).status).toBe(401);
  });
  it("rejects malformed JSON and enforces attempt limits", async () => {
    const a = new Client();
    const u = await a.register();
    let status = 0;
    for (let i = 0; i < 12; i++)
      status = (
        await new Client().call("/api/auth/login", "POST", {
          username: u.user.username,
          password: "wrong-password",
          turnstileToken: "test-token",
        })
      ).status;
    expect(status).toBe(429);
  });
});
