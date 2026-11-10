import { Hono } from "hono";
import { z } from "zod";
import { body, fail, id, now, type App } from "../../http";
import { requireUser } from "../auth/session";
import { naturalWeek, validDate } from "../../../../shared/dates";
const date = z.string().refine(validDate, "日期无效");
const weekInput = z
  .object({ startDate: date, endDate: date, goal: z.string().max(3000) })
  .refine((b) => b.endDate >= b.startDate, "结束日期不能早于开始日期");
const taskInput = z.object({
  title: z.string().trim().min(1).max(300),
  target: z.number().int().min(1).max(1000),
  priority: z.enum(["important", "normal"]),
  order: z.number().int().min(0).max(10000),
});
const routes = new Hono<App>();
routes.use("/weeks/*", requireUser);
routes.use("/tasks/*", requireUser);
export async function getTask(db: D1Database, uid: string, tid: string) {
  const t = await db
    .prepare(
      "SELECT * FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL",
    )
    .bind(tid, uid)
    .first<any>();
  if (!t) fail(404, "not_found", "任务不存在");
  const cs = await db
    .prepare(
      "SELECT id,request_id,created_at FROM checkins WHERE task_id=? AND user_id=? AND revoked_at IS NULL ORDER BY created_at,id",
    )
    .bind(tid, uid)
    .all<any>();
  return {
    id: t.id,
    weekId: t.week_id,
    title: t.title,
    target: t.target,
    priority: t.priority,
    order: t.sort_order,
    version: t.version,
    checkins: cs.results.map((v) => ({
      id: v.id,
      requestId: v.request_id,
      createdAt: v.created_at,
    })),
  };
}
async function getWeek(db: D1Database, uid: string, wid: string) {
  const w = await db
    .prepare("SELECT * FROM weeks WHERE id=? AND user_id=?")
    .bind(wid, uid)
    .first<any>();
  if (!w) fail(404, "not_found", "周计划不存在");
  const ts = await db
    .prepare(
      "SELECT * FROM tasks WHERE week_id=? AND user_id=? AND deleted_at IS NULL ORDER BY sort_order,id",
    )
    .bind(wid, uid)
    .all<any>();
  const cs = await db
    .prepare(
      "SELECT c.* FROM checkins c JOIN tasks t ON t.id=c.task_id WHERE t.week_id=? AND c.user_id=? AND c.revoked_at IS NULL ORDER BY c.created_at,c.id",
    )
    .bind(wid, uid)
    .all<any>();
  return {
    id: w.id,
    startDate: w.start_date,
    endDate: w.end_date,
    goal: w.goal,
    version: w.version,
    tasks: ts.results.map((t) => ({
      id: t.id,
      weekId: t.week_id,
      title: t.title,
      target: t.target,
      priority: t.priority,
      order: t.sort_order,
      version: t.version,
      checkins: cs.results
        .filter((c) => c.task_id === t.id)
        .map((c) => ({
          id: c.id,
          requestId: c.request_id,
          createdAt: c.created_at,
        })),
    })),
  };
}
routes.get("/weeks", async (c) => {
  const uid = c.get("user").id,
    from = c.req.query("startDate"),
    before = c.req.query("before");
  if (before && !validDate(before)) fail(400, "invalid_date", "日期无效");
  const rows = from
    ? await c.env.DB.prepare(
        "SELECT * FROM weeks WHERE user_id=? AND start_date=? ORDER BY start_date DESC LIMIT 100",
      )
        .bind(uid, from)
        .all<any>()
    : before
      ? await c.env.DB.prepare(
          "SELECT * FROM weeks WHERE user_id=? AND start_date<? ORDER BY start_date DESC LIMIT 51",
        )
          .bind(uid, before)
          .all<any>()
      : await c.env.DB.prepare(
          "SELECT * FROM weeks WHERE user_id=? ORDER BY start_date DESC LIMIT 51",
        )
          .bind(uid)
          .all<any>();
  const page = rows.results.slice(0, 50);
  return c.json({
    nextCursor: rows.results.length > 50 ? page.at(-1)!.start_date : null,
    weeks: page.map((w) => ({
      id: w.id,
      startDate: w.start_date,
      endDate: w.end_date,
      goal: w.goal,
      version: w.version,
    })),
  });
});
routes.post("/weeks", async (c) => {
  const b = await body(c, weekInput),
    uid = c.get("user").id,
    wid = id();
  try {
    await c.env.DB.prepare(
      "INSERT INTO weeks(id,user_id,start_date,end_date,goal) VALUES(?,?,?,?,?)",
    )
      .bind(wid, uid, b.startDate, b.endDate, b.goal)
      .run();
  } catch (e) {
    if (String(e).includes("UNIQUE"))
      fail(409, "week_exists", "这个开始日期已有周计划");
    throw e;
  }
  return c.json(await getWeek(c.env.DB, uid, wid), 201);
});
routes.get("/weeks/:id", async (c) =>
  c.json(await getWeek(c.env.DB, c.get("user").id, c.req.param("id"))),
);
routes.patch("/weeks/:id", async (c) => {
  const b = await body(
      c,
      weekInput.and(z.object({ version: z.number().int().nonnegative() })),
    ),
    uid = c.get("user").id,
    wid = c.req.param("id");
  await getWeek(c.env.DB, uid, wid);
  try {
    const row = await c.env.DB.prepare(
      "UPDATE weeks SET start_date=?,end_date=?,goal=?,version=version+1 WHERE id=? AND user_id=? AND version=? RETURNING id",
    )
      .bind(b.startDate, b.endDate, b.goal, wid, uid, b.version)
      .first();
    if (!row) fail(409, "conflict", "本周计划已被修改，请保留草稿后重新读取");
  } catch (e) {
    if (String(e).includes("UNIQUE"))
      fail(409, "week_exists", "这个开始日期已有周计划");
    throw e;
  }
  return c.json(await getWeek(c.env.DB, uid, wid));
});
routes.post("/weeks/:id/tasks", async (c) => {
  const b = await body(c, taskInput),
    uid = c.get("user").id,
    wid = c.req.param("id"),
    tid = id();
  await getWeek(c.env.DB, uid, wid);
  try {
    await c.env.DB.prepare(
      "INSERT INTO tasks(id,user_id,week_id,title,target,priority,sort_order) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(tid, uid, wid, b.title, b.target, b.priority, b.order)
      .run();
  } catch (e) {
    if (String(e).includes("UNIQUE"))
      fail(
        409,
        "important_exists",
        "本周已有一项重要任务，请编辑它或将其设为中等任务",
      );
    throw e;
  }
  return c.json(await getTask(c.env.DB, uid, tid), 201);
});
routes.patch("/tasks/:id", async (c) => {
  const b = await body(
      c,
      taskInput.extend({ version: z.number().int().nonnegative() }),
    ),
    uid = c.get("user").id,
    tid = c.req.param("id"),
    old = await getTask(c.env.DB, uid, tid);
  if (b.target < old.checkins.length)
    fail(
      409,
      "target_below_checkins",
      "计划次数不能低于已完成次数，请先撤销打卡",
    );
  try {
    const row = await c.env.DB.prepare(
      "UPDATE tasks SET title=?,target=?,priority=?,sort_order=?,version=version+1 WHERE id=? AND user_id=? AND version=? AND deleted_at IS NULL AND ?>=(SELECT COUNT(*) FROM checkins WHERE task_id=? AND revoked_at IS NULL) RETURNING id",
    )
      .bind(
        b.title,
        b.target,
        b.priority,
        b.order,
        tid,
        uid,
        b.version,
        b.target,
        tid,
      )
      .first();
    if (!row) fail(409, "conflict", "任务已被修改，请保留草稿后重新读取");
  } catch (e) {
    if (String(e).includes("UNIQUE"))
      fail(409, "important_exists", "本周已有重要任务，请先将其设为中等任务");
    throw e;
  }
  return c.json(await getTask(c.env.DB, uid, tid));
});
routes.delete("/tasks/:id", async (c) => {
  const b = await body(
      c,
      z.object({ version: z.number().int().nonnegative() }),
    ),
    uid = c.get("user").id,
    tid = c.req.param("id");
  await getTask(c.env.DB, uid, tid);
  const row = await c.env.DB.prepare(
    "UPDATE tasks SET deleted_at=?,version=version+1 WHERE id=? AND user_id=? AND version=? AND deleted_at IS NULL RETURNING id",
  )
    .bind(now(), tid, uid, b.version)
    .first();
  if (!row) fail(409, "conflict", "任务已被修改，请刷新后重试");
  return c.json({ ok: true });
});
routes.post("/tasks/:id/checkins", async (c) => {
  const b = await body(c, z.object({ requestId: z.string().min(1).max(100) })),
    uid = c.get("user").id,
    tid = c.req.param("id");
  await getTask(c.env.DB, uid, tid);
  const existing = await c.env.DB.prepare(
    "SELECT id FROM checkins WHERE user_id=? AND task_id=? AND request_id=?",
  )
    .bind(uid, tid, b.requestId)
    .first<{ id: string }>();
  if (existing)
    return c.json({
      checkinId: existing.id,
      task: await getTask(c.env.DB, uid, tid),
    });
  const cid = id();
  let row;
  try {
    row = await c.env.DB.prepare(
      "INSERT INTO checkins(id,user_id,task_id,request_id,created_at) SELECT ?,?,?,?,? FROM tasks t WHERE t.id=? AND t.user_id=? AND t.deleted_at IS NULL AND (SELECT COUNT(*) FROM checkins WHERE task_id=t.id AND revoked_at IS NULL)<t.target RETURNING id",
    )
      .bind(cid, uid, tid, b.requestId, now(), tid, uid)
      .first();
  } catch (e) {
    if (!String(e).includes("UNIQUE")) throw e;
    row = await c.env.DB.prepare(
      "SELECT id FROM checkins WHERE user_id=? AND task_id=? AND request_id=?",
    )
      .bind(uid, tid, b.requestId)
      .first<{ id: string }>();
  }
  if (!row) fail(409, "target_reached", "本项计划次数已完成");
  return c.json(
    {
      checkinId: (row as { id: string }).id,
      task: await getTask(c.env.DB, uid, tid),
    },
    201,
  );
});
routes.delete("/tasks/:id/checkins/:checkinId", async (c) => {
  const uid = c.get("user").id,
    tid = c.req.param("id");
  await getTask(c.env.DB, uid, tid);
  const row = await c.env.DB.prepare(
    "UPDATE checkins SET revoked_at=? WHERE id=? AND task_id=? AND user_id=? AND revoked_at IS NULL RETURNING id",
  )
    .bind(now(), c.req.param("checkinId"), tid, uid)
    .first();
  if (!row) fail(404, "not_found", "这次打卡不存在或已经撤销");
  return c.json({ task: await getTask(c.env.DB, uid, tid) });
});
export default routes;
