import { Hono } from "hono";
import { z } from "zod";
import { body, fail, type App } from "../../http";
import { requireUser } from "../auth/session";
import { LIMITS } from "../../../../shared/limits";
const element = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(["text", "image"]),
  text: z.string().max(1000).optional(),
  imageId: z.string().max(100).optional(),
  x: z.number().finite().min(0).max(1000),
  y: z.number().finite().min(0).max(12000),
  width: z.number().finite().min(20).max(1000),
  height: z.number().finite().min(20).max(12000),
  z: z.number().int().min(0).max(10000),
  lit: z.boolean(),
});
const schema = z
  .object({
    version: z.number().int().nonnegative(),
    height: z.number().int().min(520).max(12000),
    elements: z.array(element).max(LIMITS.boardElements),
  })
  .superRefine((b, ctx) => {
    if (new Set(b.elements.map((e) => e.id)).size !== b.elements.length)
      ctx.addIssue({ code: "custom", message: "元素ID不能重复" });
    for (const e of b.elements) {
      if (e.x + e.width > 1000 || e.y + e.height > b.height)
        ctx.addIssue({ code: "custom", message: "元素超出画布边界" });
      if (e.type === "text" && !e.text?.trim())
        ctx.addIssue({ code: "custom", message: "文字愿望不能为空" });
      if (e.type === "image" && !e.imageId)
        ctx.addIssue({ code: "custom", message: "请选择图片" });
    }
  });
const board = new Hono<App>();
board.use("*", requireUser);
board.get("/", async (c) => {
  const uid = c.get("user").id;
  await c.env.DB.prepare("INSERT OR IGNORE INTO boards(user_id) VALUES(?)")
    .bind(uid)
    .run();
  const row = await c.env.DB.prepare(
    "SELECT version,height,elements FROM boards WHERE user_id=?",
  )
    .bind(uid)
    .first<any>();
  return c.json({ ...row, elements: JSON.parse(row.elements) });
});
board.put("/", async (c) => {
  const b = await body(c, schema),
    uid = c.get("user").id;
  if (JSON.stringify(b.elements).length > 900000)
    fail(413, "board_too_large", "画布文字过多，请减少元素");
  await c.env.DB.prepare("INSERT OR IGNORE INTO boards(user_id) VALUES(?)")
    .bind(uid)
    .run();
  let saved;
  try {
    saved = await c.env.DB.prepare(
      "UPDATE boards SET version=version+1,height=?,elements=? WHERE user_id=? AND version=? RETURNING version",
    )
      .bind(b.height, JSON.stringify(b.elements), uid, b.version)
      .first<{ version: number }>();
  } catch (e) {
    if (
      String(e).includes("image_unavailable") ||
      String(e).includes("FOREIGN KEY")
    )
      fail(404, "not_found", "其中一张图片不存在或不属于你");
    throw e;
  }
  if (!saved) fail(409, "conflict", "画布已在另一个页面修改，本次草稿已保留");
  return c.json({ ...b, version: saved.version });
});
export default board;
