import { env } from "cloudflare:test";
import { it, expect } from "vitest";
it("applies separate source-registration and account-login budgets", async () => {
  const registration = env.AUTH_LIMITER.get(
    env.AUTH_LIMITER.idFromName("registration-test"),
  );
  for (let i = 0; i < 50; i++) {
    const r = await registration.fetch("https://limiter/register");
    expect(r.status).toBe(200);
  }
  expect((await registration.fetch("https://limiter/register")).status).toBe(
    429,
  );
  const account = env.AUTH_LIMITER.get(
    env.AUTH_LIMITER.idFromName("account-test"),
  );
  for (let i = 0; i < 10; i++)
    expect((await account.fetch("https://limiter/")).status).toBe(200);
  expect((await account.fetch("https://limiter/")).status).toBe(429);
});
import worker from "../../worker/src/index";
it("honors the native burst limiter before password verification", async () => {
  const r = await worker.fetch(
    new Request("https://app.test/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://app.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "burst-user",
        password: "irrelevant-password",
      }),
    }),
    {
      ...env,
      API_RATE_LIMITER: { limit: async () => ({ success: false }) },
    } as never,
  );
  expect(r.status).toBe(429);
});

import { runInDurableObject } from "cloudflare:test";
import { hmac } from "../../worker/src/features/auth/crypto";
it("enforces a whole-site daily registration budget before account creation", async () => {
  const key = await hmac(env.SESSION_SECRET, "registration:global");
  const stub = env.AUTH_LIMITER.get(env.AUTH_LIMITER.idFromName(key));
  await runInDurableObject(stub, async (_instance, state) => {
    await state.storage.put("attempts", { start: Date.now(), count: 1000 });
  });
  const r = await worker.fetch(
    new Request("https://app.test/api/auth/register", {
      method: "POST",
      headers: {
        origin: "https://app.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "budget-" + crypto.randomUUID().slice(0, 8),
        password: "budget-test-password",
        turnstileToken: "test",
      }),
    }),
    env,
  );
  expect(r.status).toBe(429);
});
