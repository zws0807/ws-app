import type { Env } from "../../worker/src/env";
export async function dispatch(env: Env, jobId?: string) {
  const query = jobId
    ? env.DB.prepare(
        "SELECT job_id FROM outbox WHERE sent_at IS NULL AND job_id=?",
      ).bind(jobId)
    : env.DB.prepare(
        "SELECT job_id FROM outbox WHERE sent_at IS NULL LIMIT 50",
      );
  const rows = await query.all<{ job_id: string }>();
  for (const row of rows.results) {
    try {
      await env.JOBS_QUEUE.send({ jobId: row.job_id });
      await env.DB.prepare("UPDATE outbox SET sent_at=? WHERE job_id=?")
        .bind(new Date().toISOString(), row.job_id)
        .run();
    } catch {
      console.error(JSON.stringify({ event: "outbox_retry_needed" }));
    }
  }
}
