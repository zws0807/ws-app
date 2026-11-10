import library from "./features/library/routes";
import board from "./features/board/routes";
import weekly from "./features/weekly/routes";
import journal from "./features/journal/routes";
import exports from "./features/export/routes";
import auth from "./features/auth/routes";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Env } from "./env";
import { ApiFailure, type App } from "./http";
const app = new Hono<App>();
app.use("*", secureHeaders());
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  const host = new URL(c.req.url).hostname;
  if (
    (c.env.APP_ENV === "local" &&
      !["127.0.0.1", "localhost", "[::1]"].includes(host)) ||
    (c.env.APP_ENV === "test" && host !== "app.test")
  )
    return c.json(
      { code: "configuration_missing", message: "本地配置不能用于公开服务" },
      503,
    );
  if (
    !c.env.API_RATE_LIMITER ||
    !c.env.DB ||
    !c.env.PRIVATE_FILES ||
    !c.env.EXPORT_FILES ||
    !c.env.SESSION_SECRET ||
    c.env.SESSION_SECRET.length < 32
  )
    return c.json(
      { code: "configuration_missing", message: "服务配置尚未就绪" },
      503,
    );
  await next();
});
app.use("/api/*", async (c, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
    c.req.header("origin") !== c.env.APP_ORIGIN
  )
    return c.json({ code: "origin_failed", message: "请求来源不受信任" }, 403);
  await next();
});
app.route("/api/auth", auth);
app.route("/api/images", library);
app.route("/api/board", board);
app.route("/api", weekly);
app.route("/api/journal", journal);
app.route("/api/exports", exports);
app.get("/api/config", (c) =>
  c.json({
    verificationRequired: !["local", "test"].includes(c.env.APP_ENV),
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY,
  }),
);
app.get("/api/health", (c) => c.json({ ok: true }));
app.notFound((c) =>
  c.json({ code: "not_found", message: "未找到此资源" }, 404),
);
app.onError((e, c) => {
  if (e instanceof ApiFailure)
    return c.json({ code: e.code, message: e.message }, e.status);
  console.error(
    JSON.stringify({
      event: "request_failed",
      path: new URL(c.req.url).pathname,
      errorType: e.name,
    }),
  );
  return c.json(
    {
      code: "internal_error",
      message: "服务暂时无法完成操作，请保留输入后重试",
    },
    500,
  );
});
export default {
  fetch: (request: Request, env: Env, ctx?: ExecutionContext) =>
    app.fetch(request, env, ctx),
};
export { AuthLimiter } from "./durable-objects/auth-limiter";
