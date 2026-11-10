import { Hono } from "hono";
import { z } from "zod";
import { body, fail, id, now, type App } from "../../http";
import { requireUser } from "../auth/session";
import { dispatch } from "../../../../jobs/src/outbox";
const exports = new Hono<App>();
exports.use("*", requireUser);
const project = (r: any) => ({
  id: r.id,
  requestId: r.request_id,
  status: r.status,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  ...(r.error ? { error: r.error } : {}),
});
exports.get("/", async (c) => {
  const r = await c.env.DB.prepare(
    "SELECT * FROM export_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
  )
    .bind(c.get("user").id)
    .all();
  return c.json({ jobs: r.results.map(project) });
});
exports.post("/", async (c) => {
  const b = await body(c, z.object({ requestId: z.string().min(1).max(100) })),
    uid = c.get("user").id;
  const prior = await c.env.DB.prepare(
    "SELECT * FROM export_jobs WHERE user_id=? AND request_id=?",
  )
    .bind(uid, b.requestId)
    .first<any>();
  if (prior) {
    if (prior.status === "failed") {
      try {
        await c.env.DB.batch([
          c.env.DB.prepare(
            "UPDATE export_jobs SET status='pending',error=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND status='failed' AND expires_at>?",
          ).bind(prior.id, now()),
          c.env.DB.prepare(
            "UPDATE outbox SET sent_at=NULL WHERE job_id=?",
          ).bind(prior.id),
        ]);
      } catch (e) {
        if (String(e).includes("UNIQUE"))
          fail(409, "export_active", "已有导出任务在处理中");
        throw e;
      }
      await dispatch(c.env, prior.id);
    }
    return c.json(
      project(
        await c.env.DB.prepare("SELECT * FROM export_jobs WHERE id=?")
          .bind(prior.id)
          .first(),
      ),
      202,
    );
  }
  const jid = id(),
    created = now(),
    expires = new Date(Date.now() + 86400000).toISOString(),
    db = c.env.DB;
  const sqls = [
    db
      .prepare(
        "INSERT INTO export_jobs(id,user_id,request_id,created_at,expires_at) VALUES(?,?,?,?,?)",
      )
      .bind(jid, uid, b.requestId, created, expires),
    db
      .prepare(
        "INSERT INTO export_snapshot_records(job_id,kind,data) SELECT ?,'board',json_object('version',version,'height',height,'elements',json(elements)) FROM boards WHERE user_id=?",
      )
      .bind(jid, uid),
    db
      .prepare(
        "INSERT INTO export_snapshot_records(job_id,kind,data) SELECT ?,'week',json_object('id',id,'startDate',start_date,'endDate',end_date,'goal',goal,'version',version) FROM weeks WHERE user_id=?",
      )
      .bind(jid, uid),
    db
      .prepare(
        "INSERT INTO export_snapshot_records(job_id,kind,data) SELECT ?,'task',json_object('id',id,'weekId',week_id,'title',title,'target',target,'priority',priority,'order',sort_order,'version',version) FROM tasks WHERE user_id=? AND deleted_at IS NULL",
      )
      .bind(jid, uid),
    db
      .prepare(
        "INSERT INTO export_snapshot_records(job_id,kind,data) SELECT ?,'checkin',json_object('id',c.id,'taskId',c.task_id,'requestId',c.request_id,'createdAt',c.created_at) FROM checkins c JOIN tasks t ON t.id=c.task_id WHERE c.user_id=? AND c.revoked_at IS NULL AND t.deleted_at IS NULL",
      )
      .bind(jid, uid),
    db
      .prepare(
        "INSERT INTO export_snapshot_records(job_id,kind,data) SELECT ?,'journal',json_object('id',id,'date',date,'body',body,'createdAt',created_at,'version',version) FROM journals WHERE user_id=? AND deleted_at IS NULL",
      )
      .bind(jid, uid),
    db
      .prepare(
        "INSERT INTO export_file_refs(job_id,image_id,object_key,width,height,bytes,mime,sha256) SELECT ?,id,object_key,width,height,original_bytes,mime,sha256 FROM images WHERE user_id=? AND state='ready'",
      )
      .bind(jid, uid),
    db
      .prepare(
        "INSERT INTO image_refs(image_id,user_id,ref_type,ref_id) SELECT id,user_id,'export',? FROM images WHERE user_id=? AND state='ready'",
      )
      .bind(jid, uid),
    db.prepare("INSERT INTO outbox(job_id) VALUES(?)").bind(jid),
  ];
  try {
    await db.batch(sqls);
  } catch (e) {
    if (String(e).includes("UNIQUE"))
      fail(409, "export_active", "已有导出任务在处理中");
    throw e;
  }
  await dispatch(c.env, jid);
  return c.json(
    { id: jid, status: "pending", createdAt: created, expiresAt: expires },
    202,
  );
});
exports.get("/:id", async (c) => {
  const job = await c.env.DB.prepare(
    "SELECT * FROM export_jobs WHERE id=? AND user_id=?",
  )
    .bind(c.req.param("id"), c.get("user").id)
    .first<any>();
  if (!job) fail(404, "not_found", "导出不存在");
  return c.json(project(job));
});
exports.get("/:id/download", async (c) => {
  const j = await c.env.DB.prepare(
    "SELECT * FROM export_jobs WHERE id=? AND user_id=?",
  )
    .bind(c.req.param("id"), c.get("user").id)
    .first<any>();
  if (!j) fail(404, "not_found", "导出不存在");
  if (j.expires_at <= now())
    fail(409, "export_expired", "备份已过期，请重新导出");
  if (j.status !== "ready")
    fail(409, "export_not_ready", "备份尚未完成，请稍后重试");
  const obj = await c.env.EXPORT_FILES.get(j.object_key);
  if (!obj) fail(404, "not_found", "备份文件不存在，请重新导出");
  return new Response(obj!.body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition":
        'attachment; filename="flow-backup-' + j.id + '.zip"',
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
export default exports;
