import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { Env } from "../../worker/src/env";
const partSize = 5 * 1024 * 1024;
export async function runExport(env: Env, jobId: string): Promise<void> {
  const now = new Date().toISOString(),
    token = crypto.randomUUID();
  const job = await env.DB.prepare(
    "UPDATE export_jobs SET status='running',lease_token=?,lease_until=?,error=NULL WHERE id=? AND expires_at>? AND (status IN ('pending','failed') OR (status='running' AND lease_until<?)) RETURNING *",
  )
    .bind(token, new Date(Date.now() + 600000).toISOString(), jobId, now, now)
    .first<any>();
  if (!job) return;
  const key = job.user_id + "/" + jobId + "/" + token + ".zip";
  let upload: R2MultipartUpload | undefined;
  try {
    if (job.upload_id)
      await env.EXPORT_FILES.resumeMultipartUpload(
        job.upload_key,
        job.upload_id,
      ).abort();
    if (job.upload_key) await env.EXPORT_FILES.delete(job.upload_key);
    upload = await env.EXPORT_FILES.createMultipartUpload(key, {
      httpMetadata: { contentType: "application/zip" },
    });
    await env.DB.prepare(
      "UPDATE export_jobs SET upload_key=?,upload_id=? WHERE id=? AND lease_token=?",
    )
      .bind(key, upload.uploadId, jobId, token)
      .run();
    let buffer = new Uint8Array(partSize),
      used = 0,
      part = 1;
    const parts: R2UploadedPart[] = [];
    let queue: Uint8Array[] = [];
    let zipError: Error | null = null;
    const write = async (chunk: Uint8Array) => {
      let offset = 0;
      while (offset < chunk.length) {
        const n = Math.min(partSize - used, chunk.length - offset);
        buffer.set(chunk.subarray(offset, offset + n), used);
        used += n;
        offset += n;
        if (used === partSize) {
          parts.push(await upload!.uploadPart(part++, buffer));
          buffer = new Uint8Array(partSize);
          used = 0;
        }
      }
    };
    const zip = new Zip((error, data) => {
      if (error) zipError = error;
      if (data) queue.push(data);
    });
    const drain = async () => {
      if (zipError) throw zipError;
      const chunks = queue;
      queue = [];
      for (const chunk of chunks) await write(chunk);
    };
    const manifest = new ZipPassThrough("manifest.json");
    zip.add(manifest);
    const push = async (s: string) => {
      manifest.push(strToU8(s), false);
      await drain();
    };
    await push(
      JSON.stringify({ schemaVersion: 1, createdAt: job.created_at }).slice(
        0,
        -1,
      ) + ',"records":[',
    );
    let cursor = 0,
      comma = false;
    while (true) {
      const page = await env.DB.prepare(
        "SELECT id,kind,data FROM export_snapshot_records WHERE job_id=? AND id>? ORDER BY id LIMIT 100",
      )
        .bind(jobId, cursor)
        .all<any>();
      for (const r of page.results) {
        await push(
          (comma ? "," : "") +
            JSON.stringify({ kind: r.kind, data: JSON.parse(r.data) }),
        );
        comma = true;
        cursor = r.id;
      }
      if (page.results.length < 100) break;
    }
    await push('],"images":[');
    let last = "",
      imageComma = false;
    while (true) {
      const page = await env.DB.prepare(
        "SELECT * FROM export_file_refs WHERE job_id=? AND image_id>? ORDER BY image_id LIMIT 100",
      )
        .bind(jobId, last)
        .all<any>();
      for (const r of page.results) {
        const ext =
          r.mime === "image/jpeg"
            ? "jpg"
            : r.mime === "image/png"
              ? "png"
              : "webp";
        await push(
          (imageComma ? "," : "") +
            JSON.stringify({
              id: r.image_id,
              path: "images/" + r.image_id + "." + ext,
              width: r.width,
              height: r.height,
              bytes: r.bytes,
              sha256: r.sha256,
            }),
        );
        imageComma = true;
        last = r.image_id;
      }
      if (page.results.length < 100) break;
    }
    await push("]}");
    manifest.push(new Uint8Array(), true);
    await drain();
    last = "";
    while (true) {
      const page = await env.DB.prepare(
        "SELECT * FROM export_file_refs WHERE job_id=? AND image_id>? ORDER BY image_id LIMIT 100",
      )
        .bind(jobId, last)
        .all<any>();
      for (const r of page.results) {
        const object = await env.PRIVATE_FILES.get(r.object_key);
        if (!object) throw new Error("snapshot_file_missing");
        const ext =
            r.mime === "image/jpeg"
              ? "jpg"
              : r.mime === "image/png"
                ? "png"
                : "webp",
          file = new ZipPassThrough("images/" + r.image_id + "." + ext),
          hash = sha256.create();
        zip.add(file);
        let total = 0;
        const reader = object.body.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          total += value.length;
          hash.update(value);
          file.push(value, false);
          await drain();
        }
        file.push(new Uint8Array(), true);
        await drain();
        if (
          total !== r.bytes ||
          (r.sha256 && bytesToHex(hash.digest()) !== r.sha256)
        )
          throw new Error("snapshot_file_mismatch");
        last = r.image_id;
      }
      if (page.results.length < 100) break;
    }
    zip.end();
    await drain();
    if (used) parts.push(await upload.uploadPart(part, buffer.slice(0, used)));
    await upload.complete(parts);
    const ready = await env.DB.prepare(
      "UPDATE export_jobs SET status='ready',object_key=?,upload_key=NULL,upload_id=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND status='running' AND lease_token=? RETURNING id",
    )
      .bind(key, jobId, token)
      .first();
    if (!ready) await env.EXPORT_FILES.delete(key);
  } catch (e) {
    // Reconcile a possibly committed ready transition before compensating R2.
    // If D1 is unavailable, preserve the tracked object for the next lease.
    const current = await env.DB.prepare(
      "SELECT status,object_key FROM export_jobs WHERE id=?",
    )
      .bind(jobId)
      .first<any>();
    if (current?.status === "ready" && current.object_key === key) return;
    if (upload) {
      try {
        await upload.abort();
        await env.DB.prepare(
          "UPDATE export_jobs SET upload_key=NULL,upload_id=NULL WHERE id=? AND lease_token=?",
        )
          .bind(jobId, token)
          .run();
      } catch {}
    }
    await env.EXPORT_FILES.delete(key).catch(() => {});
    await env.DB.prepare(
      "UPDATE export_jobs SET status='failed',error='导出失败，请重试；已有记录不受影响',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
    )
      .bind(jobId, token)
      .run();
    throw e;
  }
}
