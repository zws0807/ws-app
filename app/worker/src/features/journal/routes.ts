import { Hono } from "hono";
import { z } from "zod";
import { body, fail, id, now, type App } from "../../http";
import { requireUser } from "../auth/session";
import { validDate } from "../../../../shared/dates";
import { LIMITS } from "../../../../shared/limits";
const input = z.object({
  date: z.string().refine(validDate, "请选择有效日期"),
  body: z
    .string()
    .max(LIMITS.journalChars)
    .refine((s) => !!s.trim(), "先写下一点感受吧"),
  requestId: z.string().min(1).max(100).optional(),
});
const project = (r: any) => ({
  id: r.id,
  date: r.date,
  body: r.body,
  createdAt: r.created_at,
  version: r.version,
});
const journal = new Hono<App>();
journal.use("*", requireUser);
journal.get("/", async (c) => {
  const uid = c.get("user").id,
    before = c.req.query("before");
  let rows;
  if (before) {
    const cursor = await c.env.DB.prepare(
      "SELECT created_at,id FROM journals WHERE id=? AND user_id=?",
    )
      .bind(before, uid)
      .first<any>();
    if (!cursor) fail(404, "not_found", "记录位置不存在");
    rows = await c.env.DB.prepare(
      "SELECT * FROM journals WHERE user_id=? AND deleted_at IS NULL AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 51",
    )
      .bind(uid, cursor.created_at, cursor.created_at, cursor.id)
      .all<any>();
  } else
    rows = await c.env.DB.prepare(
      "SELECT * FROM journals WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 51",
    )
      .bind(uid)
      .all<any>();
  const page = rows.results.slice(0, 50);
  return c.json({
    entries: page.map(project),
    nextCursor: rows.results.length > 50 ? page.at(-1)!.id : null,
  });
});
journal.post("/", async (c) => {
  const b = await body(c, input),
    uid = c.get("user").id,
    jid = id(),
    created = now();
  if (b.requestId) {
    const prior = await c.env.DB.prepare(
      "SELECT * FROM journals WHERE user_id=? AND request_id=?",
    )
      .bind(uid, b.requestId)
      .first<any>();
    if (prior) {
      if (prior.date !== b.date || prior.body !== b.body || prior.deleted_at)
        fail(
          409,
          "request_payload_changed",
          "上次提交已保存，当前草稿内容不同，请再次保存为新记录",
        );
      return c.json(project(prior));
    }
  }
  await c.env.DB.prepare(
    "INSERT INTO journals(id,user_id,date,body,created_at,request_id) VALUES(?,?,?,?,?,?)",
  )
    .bind(jid, uid, b.date, b.body, created, b.requestId || null)
    .run();
  return c.json(
    { id: jid, date: b.date, body: b.body, createdAt: created, version: 0 },
    201,
  );
});
journal.patch("/:id", async (c) => {
  const b = await body(
      c,
      input.and(z.object({ version: z.number().int().nonnegative() })),
    ),
    uid = c.get("user").id,
    jid = c.req.param("id");
  const old = await c.env.DB.prepare(
    "SELECT * FROM journals WHERE user_id=? AND id=? AND deleted_at IS NULL",
  )
    .bind(uid, jid)
    .first<any>();
  if (!old) fail(404, "not_found", "记录不存在");
  const row = await c.env.DB.prepare(
    "UPDATE journals SET date=?,body=?,version=version+1 WHERE user_id=? AND id=? AND version=? AND deleted_at IS NULL RETURNING *",
  )
    .bind(b.date, b.body, uid, jid, b.version)
    .first<any>();
  if (!row) fail(409, "conflict", "这条记录已在其他页面修改，当前草稿已保留");
  return c.json(project(row));
});
journal.delete("/:id", async (c) => {
  const b = await body(
      c,
      z.object({ version: z.number().int().nonnegative() }),
    ),
    uid = c.get("user").id,
    jid = c.req.param("id");
  const old = await c.env.DB.prepare(
    "SELECT id FROM journals WHERE user_id=? AND id=? AND deleted_at IS NULL",
  )
    .bind(uid, jid)
    .first();
  if (!old) fail(404, "not_found", "记录不存在");
  const row = await c.env.DB.prepare(
    "UPDATE journals SET deleted_at=?,version=version+1 WHERE user_id=? AND id=? AND version=? AND deleted_at IS NULL RETURNING id",
  )
    .bind(now(), uid, jid, b.version)
    .first();
  if (!row) fail(409, "conflict", "记录已修改，请刷新后重试");
  return c.json({ ok: true });
});
export default journal;
