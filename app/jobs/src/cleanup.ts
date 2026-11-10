import type { Env } from "../../worker/src/env";
export async function cleanup(env: Env) {
  const now = new Date().toISOString();
  const stale = await env.DB.prepare(
    "SELECT id FROM export_jobs WHERE status='running' AND lease_until<? AND expires_at>? LIMIT 50",
  )
    .bind(now, now)
    .all<{ id: string }>();
  for (const j of stale.results)
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE export_jobs SET status='pending',lease_token=NULL WHERE id=? AND status='running' AND lease_until<?",
      ).bind(j.id, now),
      env.DB.prepare("UPDATE outbox SET sent_at=NULL WHERE job_id=?").bind(
        j.id,
      ),
    ]);
  const jobs = await env.DB.prepare(
    "SELECT * FROM export_jobs j WHERE expires_at<? AND (status!='running' OR lease_until<?) AND (status!='expired' OR object_key IS NOT NULL OR upload_id IS NOT NULL OR upload_key IS NOT NULL OR EXISTS(SELECT 1 FROM outbox WHERE job_id=j.id)) LIMIT 100",
  )
    .bind(now, now)
    .all<any>();
  for (const j of jobs.results) {
    try {
      await env.DB.prepare(
        "UPDATE export_jobs SET status='expired',lease_token=NULL,lease_until=NULL WHERE id=?",
      )
        .bind(j.id)
        .run();
      if (j.upload_id)
        await env.EXPORT_FILES.resumeMultipartUpload(
          j.upload_key,
          j.upload_id,
        ).abort();
      if (j.upload_key) await env.EXPORT_FILES.delete(j.upload_key);
      if (j.object_key) await env.EXPORT_FILES.delete(j.object_key);
      await env.DB.batch([
        env.DB.prepare(
          "DELETE FROM image_refs WHERE ref_type='export' AND ref_id=?",
        ).bind(j.id),
        env.DB.prepare("DELETE FROM export_file_refs WHERE job_id=?").bind(
          j.id,
        ),
        env.DB.prepare(
          "DELETE FROM export_snapshot_records WHERE job_id=?",
        ).bind(j.id),
        env.DB.prepare("DELETE FROM outbox WHERE job_id=?").bind(j.id),
        env.DB.prepare(
          "UPDATE export_jobs SET object_key=NULL,upload_key=NULL,upload_id=NULL WHERE id=?",
        ).bind(j.id),
      ]);
    } catch {
      console.error(JSON.stringify({ event: "export_cleanup_retry" }));
    }
  }
  const images = await env.DB.prepare(
    "SELECT * FROM images WHERE (state='pending' AND expires_at<?) OR state='failed' OR (state='deleted' AND deleted_at<?) LIMIT 100",
  )
    .bind(now, new Date(Date.now() - 7 * 86400000).toISOString())
    .all<any>();
  for (const image of images.results) {
    try {
      if (image.state === "pending") {
        const row = await env.DB.prepare(
          "UPDATE images SET state='failed' WHERE id=? AND state='pending' AND expires_at<? RETURNING id",
        )
          .bind(image.id, now)
          .first();
        if (!row) continue;
      }
      await env.PRIVATE_FILES.delete([image.object_key, image.thumb_key]);
      await env.DB.prepare(
        "DELETE FROM images WHERE id=? AND state IN ('failed','deleted') AND NOT EXISTS(SELECT 1 FROM image_refs WHERE image_id=?)",
      )
        .bind(image.id, image.id)
        .run();
    } catch {
      console.error(JSON.stringify({ event: "image_cleanup_retry" }));
    }
  }
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at<?")
    .bind(now)
    .run();
}
