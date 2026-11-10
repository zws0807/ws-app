import { DurableObject } from "cloudflare:workers";
export class AuthLimiter extends DurableObject {
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    const global = path === "/registration-global";
    const limit = global ? 1000 : path === "/register" ? 50 : 10;
    const windowMs = global ? 86400000 : 600000;
    const t = Date.now();
    const allowed = await this.ctx.storage.transaction(async (tx) => {
      const entry = await tx.get<{ start: number; count: number }>("attempts");
      const v =
        entry && t - entry.start < windowMs ? entry : { start: t, count: 0 };
      if (v.count >= limit) return false;
      v.count++;
      await tx.put("attempts", v);
      await tx.setAlarm(v.start + windowMs);
      return true;
    });
    return Response.json({ allowed }, { status: allowed ? 200 : 429 });
  }
  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
