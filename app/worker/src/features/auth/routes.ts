import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { body, fail, id, now, type App } from "../../http";
import {
  hashPassword,
  verifyPassword,
  digest,
  hmac,
  randomToken,
} from "./crypto";
import { issue, requireUser, clearCookie } from "./session";
const username = z
  .string()
  .transform((s) => s.normalize("NFKC").trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(3)
      .max(32)
      .regex(/^[\p{L}\p{N}_-]+$/u, "用户名只能使用文字、数字、下划线或横线"),
  );
const password = z.string().min(12, "密码至少12个字符").max(128);
const challenge = z.string().min(1);
const auth = new Hono<App>();
async function limit(c: Context<App>, name: string) {
  const key = await hmac(c.env.SESSION_SECRET, "account:" + name);
  if (!(await c.env.API_RATE_LIMITER.limit({ key })).success)
    fail(429, "rate_limited", "请求过于频繁，请稍后再试");
  const r = await c.env.AUTH_LIMITER.get(
    c.env.AUTH_LIMITER.idFromName(key),
  ).fetch(
    name.startsWith("register:")
      ? "https://limiter/register"
      : "https://limiter/",
  );
  if (r.status === 429)
    fail(429, "rate_limited", "尝试过于频繁，请10分钟后再试");
}
async function turnstile(c: Context<App>, token: string, action: string) {
  if (c.env.APP_ENV === "local" || c.env.APP_ENV === "test") {
    if (!c.env.TURNSTILE_SECRET?.startsWith("1x000"))
      fail(503, "configuration_missing", "本地验证配置未就绪");
    return;
  }
  if (!c.env.TURNSTILE_SECRET || c.env.TURNSTILE_SECRET.startsWith("1x000"))
    fail(503, "configuration_missing", "安全验证配置未完成");
  let result: any;
  try {
    const r = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: JSON.stringify({
          secret: c.env.TURNSTILE_SECRET,
          response: token,
        }),
        headers: { "content-type": "application/json" },
      },
    );
    result = await r.json();
  } catch {
    fail(503, "challenge_unavailable", "安全验证暂不可用，请稍后重试");
  }
  if (
    !result.success ||
    result.hostname !== new URL(c.env.APP_ORIGIN).hostname ||
    result.action !== action
  )
    fail(403, "challenge_failed", "请重新完成安全验证");
}
auth.post("/register", async (c) => {
  const b = await body(
    c,
    z.object({ username, password, turnstileToken: challenge }),
  );
  await turnstile(c, b.turnstileToken, "register");
  await limit(
    c,
    "register:" +
      (await hmac(
        c.env.SESSION_SECRET,
        c.req.header("cf-connecting-ip") || "local",
      )),
  );
  const globalKey = await hmac(c.env.SESSION_SECRET, "registration:global");
  const budget = await c.env.AUTH_LIMITER.get(
    c.env.AUTH_LIMITER.idFromName(globalKey),
  ).fetch("https://limiter/registration-global");
  if (budget.status === 429)
    fail(429, "registration_capacity", "今日注册名额已用完，请稍后再试");
  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE username=?",
  )
    .bind(b.username)
    .first();
  if (existing) fail(409, "username_taken", "这个用户名已被使用");
  const uid = id(),
    recoveryCode = randomToken(),
    hash = await hashPassword(b.password);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO users VALUES(?,?,?,?)").bind(
        uid,
        b.username,
        b.username,
        now(),
      ),
      c.env.DB.prepare(
        "INSERT INTO credentials(user_id,password_hash,recovery_hash) VALUES(?,?,?)",
      ).bind(uid, hash, await digest(recoveryCode)),
      c.env.DB.prepare("INSERT INTO storage_usage(user_id) VALUES(?)").bind(
        uid,
      ),
    ]);
  } catch (e) {
    if (String(e).includes("UNIQUE"))
      fail(409, "username_taken", "这个用户名已被使用");
    throw e;
  }
  return c.json(
    {
      ...(await issue(
        c,
        { id: uid, username: b.username, displayName: b.username },
        1,
      )),
      recoveryCode,
    },
    201,
  );
});
auth.post("/login", async (c) => {
  const b = await body(
    c,
    z.object({
      username,
      password: z.string().min(1).max(128),
      turnstileToken: challenge.optional(),
    }),
  );
  await limit(c, b.username);
  const row = await c.env.DB.prepare(
    "SELECT u.id,u.username,u.display_name,cr.password_hash,cr.version FROM users u JOIN credentials cr ON cr.user_id=u.id WHERE u.username=?",
  )
    .bind(b.username)
    .first<{
      id: string;
      username: string;
      display_name: string;
      password_hash: string;
      version: number;
    }>();
  if (!row) {
    await hashPassword(b.password);
    fail(401, "invalid_credentials", "用户名或凭据不正确");
  }
  if (!(await verifyPassword(b.password, row!.password_hash)))
    fail(401, "invalid_credentials", "用户名或凭据不正确");
  return c.json(
    await issue(
      c,
      { id: row!.id, username: row!.username, displayName: row!.display_name },
      row!.version,
    ),
  );
});
auth.post("/recover", async (c) => {
  const b = await body(
    c,
    z.object({
      username,
      recoveryCode: z.string().min(1).max(128),
      newPassword: password,
      turnstileToken: challenge,
    }),
  );
  await turnstile(c, b.turnstileToken, "recover");
  await limit(c, b.username);
  const oldHash = await digest(b.recoveryCode);
  const row = await c.env.DB.prepare(
    "SELECT u.id FROM users u JOIN credentials cr ON cr.user_id=u.id WHERE u.username=? AND cr.recovery_hash=?",
  )
    .bind(b.username, oldHash)
    .first<{ id: string }>();
  if (!row) fail(401, "invalid_credentials", "用户名或凭据不正确");
  const recoveryCode = randomToken(),
    newHash = await hashPassword(b.newPassword);
  const [updated] = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE credentials SET password_hash=?,recovery_hash=?,version=version+1 WHERE user_id=? AND recovery_hash=?",
    ).bind(newHash, await digest(recoveryCode), row!.id, oldHash),
    c.env.DB.prepare(
      "DELETE FROM sessions WHERE user_id=? AND credential_version<>(SELECT version FROM credentials WHERE user_id=?)",
    ).bind(row!.id, row!.id),
  ]);
  if (updated.meta.changes !== 1)
    fail(401, "invalid_credentials", "用户名或凭据不正确");
  return c.json({ recoveryCode });
});
auth.use("/me", requireUser);
auth.get("/me", (c) =>
  c.json({ user: c.get("user"), csrfToken: c.get("csrf") }),
);
auth.use("/logout", requireUser);
auth.post("/logout", async (c) => {
  await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
    .bind(c.get("sessionHash"))
    .run();
  clearCookie(c);
  return c.json({ ok: true });
});
auth.use("/password", requireUser);
auth.post("/password", async (c) => {
  const b = await body(
    c,
    z.object({ oldPassword: z.string().max(128), newPassword: password }),
  );
  const uid = c.get("user").id;
  await limit(c, c.get("user").username);
  const cr = await c.env.DB.prepare(
    "SELECT password_hash,version FROM credentials WHERE user_id=?",
  )
    .bind(uid)
    .first<{ password_hash: string; version: number }>();
  if (!(await verifyPassword(b.oldPassword, cr!.password_hash)))
    fail(401, "invalid_credentials", "用户名或凭据不正确");
  const [r] = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE credentials SET password_hash=?,version=version+1 WHERE user_id=? AND version=?",
    ).bind(await hashPassword(b.newPassword), uid, cr!.version),
    c.env.DB.prepare(
      "DELETE FROM sessions WHERE user_id=? AND credential_version<>(SELECT version FROM credentials WHERE user_id=?)",
    ).bind(uid, uid),
  ]);
  if (r.meta.changes !== 1)
    fail(409, "conflict", "密码已在其他页面修改，请重新登录");
  return c.json(await issue(c, c.get("user"), cr!.version + 1));
});
export default auth;
