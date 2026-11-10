import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Hono } from "hono";
import { fail, id, now, ApiFailure, type App } from "../../http";
import { requireUser } from "../auth/session";
import { detectImage } from "../../storage/image-format";
import { LIMITS } from "../../../../shared/limits";
const library = new Hono<App>();
library.use("*", requireUser);
let uploading = 0;
const project = (r: any) => ({
  id: r.id,
  width: r.width,
  height: r.height,
  bytes: r.bytes,
  createdAt: r.created_at,
});
library.get("/", async (c) => {
  const uid = c.get("user").id;
  const before = c.req.query("before");
  let cursor: any = null;
  if (before) {
    cursor = await c.env.DB.prepare(
      "SELECT created_at,id FROM images WHERE id=? AND user_id=?",
    )
      .bind(before, uid)
      .first();
    if (!cursor) fail(404, "not_found", "图片位置不存在");
  }
  const r = cursor
    ? await c.env.DB.prepare(
        "SELECT * FROM images WHERE user_id=? AND state='ready' AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 51",
      )
        .bind(uid, cursor.created_at, cursor.created_at, cursor.id)
        .all<any>()
    : await c.env.DB.prepare(
        "SELECT * FROM images WHERE user_id=? AND state='ready' ORDER BY created_at DESC,id DESC LIMIT 51",
      )
        .bind(uid)
        .all<any>();
  const page = r.results.slice(0, 50);
  const usage = await c.env.DB.prepare(
    "SELECT used_bytes,reserved_bytes FROM storage_usage WHERE user_id=?",
  )
    .bind(uid)
    .first();
  return c.json({
    images: page.map(project),
    nextCursor: r.results.length > 50 ? page.at(-1)!.id : null,
    usage: {
      used: (usage?.used_bytes as number) || 0,
      reserved: (usage?.reserved_bytes as number) || 0,
      limit: LIMITS.accountBytes,
    },
  });
});
library.post("/", async (c) => {
  if (uploading >= 1)
    fail(503, "upload_busy", "另一个图片正在处理，请稍后重试");
  uploading++;
  let imgId = "",
    key = "",
    thumb = "";
  const uid = c.get("user").id;
  try {
    const reqId = c.req.header("x-request-id");
    if (!reqId || reqId.length > 100)
      fail(400, "invalid_request_id", "上传缺少重试标识");
    const old = await c.env.DB.prepare(
      "SELECT * FROM images WHERE user_id=? AND request_id=?",
    )
      .bind(uid, reqId!)
      .first<any>();
    if (old?.state === "ready") return c.json(project(old), 200);
    if (old?.state === "pending")
      fail(409, "upload_pending", "图片仍在处理中，请稍后重试");
    if (old) fail(409, "upload_retry_new", "上次上传失败，请重新选择上传");
    const reader = c.req.raw.body?.getReader();
    if (!reader) fail(400, "invalid_image", "请选择图片");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      size += value.length;
      if (size > LIMITS.imageBytes + 65536) {
        await reader!.cancel();
        fail(413, "image_too_large", "单张图片不得超过10MB");
      }
      chunks.push(value);
    }
    const raw = new Uint8Array(size);
    let off = 0;
    for (const chunk of chunks) {
      raw.set(chunk, off);
      off += chunk.length;
    }
    const form = await new Request(c.req.url, {
      method: "POST",
      headers: { "content-type": c.req.header("content-type") || "" },
      body: raw,
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) fail(400, "invalid_image", "请选择图片");
    const f = file as File;
    if (f.size > LIMITS.imageBytes)
      fail(413, "image_too_large", "单张图片不得超过10MB");
    const bytes = new Uint8Array(await f.arrayBuffer()),
      format = detectImage(bytes);
    if (
      f.type !== format.mime ||
      !format.extensions.includes(f.name.split(".").pop()?.toLowerCase() || "")
    )
      fail(400, "invalid_image", "图片内容与文件格式不一致");
    imgId = id();
    key = uid + "/" + imgId + "/original";
    thumb = uid + "/" + imgId + "/thumb.webp";
    try {
      await c.env.DB.prepare(
        "INSERT INTO images(id,user_id,request_id,state,object_key,thumb_key,mime,reservation,created_at,expires_at) VALUES(?,?,?,'pending',?,?,?,?,?,?)",
      )
        .bind(
          imgId,
          uid,
          reqId!,
          key,
          thumb,
          format.mime,
          f.size + LIMITS.thumbnailBytes,
          now(),
          new Date(Date.now() + 600000).toISOString(),
        )
        .run();
    } catch (e) {
      imgId = "";
      if (String(e).includes("quota_exceeded"))
        fail(413, "quota_exceeded", "图片空间不足（每账号200MB）");
      if (String(e).includes("UNIQUE"))
        fail(409, "upload_pending", "相同图片正在上传，请稍后重试");
      throw e;
    }
    let width = 0,
      height = 0,
      thumbnail: ArrayBuffer;
    try {
      const info = await c.env.IMAGES.info(new Blob([bytes]).stream());
      if (!("width" in info) || !info.width || !info.height)
        fail(400, "invalid_image", "无法读取图片尺寸");
      width = info.width;
      height = info.height;
      if (width * height > LIMITS.imagePixels)
        fail(413, "image_too_large", "图片不得超过2400万像素");
      const transformed = await c.env.IMAGES.input(new Blob([bytes]).stream())
        .transform({ width: 480, height: 480, fit: "scale-down" })
        .output({ format: "image/webp" });
      thumbnail = await transformed.response().arrayBuffer();
      if (thumbnail.byteLength > LIMITS.thumbnailBytes)
        fail(413, "image_too_large", "生成的缩略图过大");
    } catch (e) {
      if (e instanceof ApiFailure) throw e;
      fail(400, "invalid_image", "图片损坏或格式暂不支持，请换一张图片");
    }
    await c.env.PRIVATE_FILES.put(key, bytes, {
      httpMetadata: { contentType: format.mime },
    });
    await c.env.PRIVATE_FILES.put(thumb, thumbnail!, {
      httpMetadata: { contentType: "image/webp" },
    });
    const total = f.size + thumbnail!.byteLength;
    const r = await c.env.DB.prepare(
      "UPDATE images SET state='ready',width=?,height=?,bytes=?,original_bytes=?,sha256=? WHERE id=? AND user_id=? AND state='pending'",
    )
      .bind(width, height, total, f.size, bytesToHex(sha256(bytes)), imgId, uid)
      .run();
    if (r.meta.changes < 1)
      fail(409, "upload_expired", "上传已过期，请重新上传");
    return c.json(
      { id: imgId, width, height, bytes: total, createdAt: now() },
      201,
    );
  } catch (e) {
    if (imgId) {
      // A lost D1 reply can follow a committed ready transition. Reconcile
      // before removing objects; an unknown state is left for scheduled cleanup.
      try {
        await c.env.DB.prepare(
          "UPDATE images SET state='failed' WHERE id=? AND user_id=? AND state='pending'",
        )
          .bind(imgId, uid)
          .run();
        const current = await c.env.DB.prepare(
          "SELECT * FROM images WHERE id=? AND user_id=?",
        )
          .bind(imgId, uid)
          .first<any>();
        if (current?.state === "ready") return c.json(project(current), 200);
        if (current?.state === "failed")
          await c.env.PRIVATE_FILES.delete([key, thumb]);
      } catch {}
    }
    throw e;
  } finally {
    uploading--;
  }
});
for (const kind of ["content", "thumbnail"])
  library.get("/:id/" + kind, async (c) => {
    const image = await c.env.DB.prepare(
      "SELECT object_key,thumb_key,mime FROM images WHERE id=? AND user_id=? AND state='ready'",
    )
      .bind(c.req.param("id"), c.get("user").id)
      .first<any>();
    if (!image) fail(404, "not_found", "图片不存在");
    const object = await c.env.PRIVATE_FILES.get(
      kind === "content" ? image!.object_key : image!.thumb_key,
    );
    if (!object) fail(404, "not_found", "图片暂不可用");
    return new Response(object!.body, {
      headers: {
        "content-type": kind === "content" ? image!.mime : "image/webp",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
library.delete("/:id", async (c) => {
  try {
    const r = await c.env.DB.prepare(
      "UPDATE images SET state='deleted',deleted_at=? WHERE id=? AND user_id=? AND state='ready'",
    )
      .bind(now(), c.req.param("id"), c.get("user").id)
      .run();
    if (r.meta.changes !== 1) fail(404, "not_found", "图片不存在");
  } catch (e) {
    if (String(e).includes("image_referenced"))
      fail(
        409,
        "image_referenced",
        "图片仍被愿望板或有效导出使用，请先移除引用",
      );
    throw e;
  }
  return c.json({ ok: true });
});
export default library;
