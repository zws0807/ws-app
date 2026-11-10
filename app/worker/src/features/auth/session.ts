import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { fail, now, type App } from "../../http";
import { digest, hmac, randomToken, equal } from "./crypto";
import type { User } from "../../../../shared/contracts";
const cookieName = (c: Context<App>) =>
  c.env.APP_ENV === "production" || c.env.APP_ENV === "staging"
    ? "__Host-flow_session"
    : "flow_session_local";
export async function issue(c: Context<App>, user: User, version: number) {
  const token = randomToken(),
    hashed = await digest(token);
  await c.env.DB.prepare(
    "INSERT INTO sessions(token_hash,user_id,credential_version,expires_at) VALUES(?,?,?,?)",
  )
    .bind(
      hashed,
      user.id,
      version,
      new Date(Date.now() + 7 * 86400000).toISOString(),
    )
    .run();
  setCookie(c, cookieName(c), token, {
    httpOnly: true,
    secure: ["production", "staging"].includes(c.env.APP_ENV),
    sameSite: "Lax",
    path: "/",
    maxAge: 604800,
  });
  return { user, csrfToken: await hmac(c.env.SESSION_SECRET, token) };
}
export async function requireUser(c: Context<App>, next: Next) {
  const token = getCookie(c, cookieName(c));
  if (!token) fail(401, "unauthorized", "请先登录");
  const hashed = await digest(token!);
  const row = await c.env.DB.prepare(
    "SELECT u.id,u.username,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id JOIN credentials cr ON cr.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND s.credential_version=cr.version",
  )
    .bind(hashed, now())
    .first<{ id: string; username: string; display_name: string }>();
  if (!row) fail(401, "unauthorized", "请重新登录");
  const csrf = await hmac(c.env.SESSION_SECRET, token!);
  if (
    !["GET", "HEAD"].includes(c.req.method) &&
    !equal(c.req.header("x-csrf-token") || "", csrf)
  )
    fail(403, "csrf_failed", "页面验证已失效，请刷新后重试");
  if (
    !(
      await c.env.API_RATE_LIMITER.limit({
        key: await hmac(c.env.SESSION_SECRET, "user:" + row!.id),
      })
    ).success
  )
    fail(429, "rate_limited", "请求过于频繁，请稍后再试");
  c.set("user", {
    id: row!.id,
    username: row!.username,
    displayName: row!.display_name,
  });
  c.set("sessionHash", hashed);
  c.set("csrf", csrf);
  await next();
}
export function clearCookie(c: Context<App>) {
  deleteCookie(c, cookieName(c), { path: "/" });
}
