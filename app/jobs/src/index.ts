import type { Env } from "../../worker/src/env";
import { runExport } from "./export";
import { cleanup } from "./cleanup";
import { dispatch } from "./outbox";
export default {
  async queue(batch: MessageBatch<{ jobId: string }>, env: Env) {
    for (const message of batch.messages) {
      try {
        if (typeof message.body?.jobId !== "string") {
          message.ack();
          continue;
        }
        await runExport(env, message.body.jobId);
        message.ack();
      } catch {
        console.error(JSON.stringify({ event: "export_job_retry" }));
        message.retry({ delaySeconds: 30 });
      }
    }
  },
  async scheduled(_controller: ScheduledController, env: Env) {
    await cleanup(env);
    await dispatch(env);
  },
};
