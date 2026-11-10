import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { Client } from "./helpers";
import { cleanup } from "../../jobs/src/cleanup";
import { runExport } from "../../jobs/src/export";
import { dispatch } from "../../jobs/src/outbox";
import { unzipSync } from "fflate";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
describe("jobs", () => {
  it("expires archives and releases frozen image references", async () => {
    const a = new Client();
    await a.register();
    const j: any = await (
      await a.call("/api/exports", "POST", { requestId: "expiry" })
    ).json();
    await runExport(env, j.id);
    const r: any = await env.DB.prepare(
      "SELECT object_key FROM export_jobs WHERE id=?",
    )
      .bind(j.id)
      .first();
    expect(await env.EXPORT_FILES.head(r.object_key)).not.toBeNull();
    await env.DB.prepare(
      "UPDATE export_jobs SET expires_at='2020-01-01T00:00:00.000Z' WHERE id=?",
    )
      .bind(j.id)
      .run();
    await cleanup(env);
    expect(
      ((await (await a.call("/api/exports/" + j.id)).json()) as any).status,
    ).toBe("expired");
    expect(await env.EXPORT_FILES.head(r.object_key)).toBeNull();
  });
  it("keeps undelivered outbox messages available for retry", async () => {
    const a = new Client();
    await a.register();
    const j: any = await (
      await a.call("/api/exports", "POST", { requestId: "outbox" })
    ).json();
    await env.DB.prepare("UPDATE outbox SET sent_at=NULL WHERE job_id=?")
      .bind(j.id)
      .run();
    await dispatch(
      {
        ...env,
        JOBS_QUEUE: {
          send: async () => {
            throw new Error("offline");
          },
        },
      } as never,
      j.id,
    );
    expect(
      (
        (await env.DB.prepare("SELECT sent_at FROM outbox WHERE job_id=?")
          .bind(j.id)
          .first()) as any
      ).sent_at,
    ).toBeNull();
    await dispatch(env, j.id);
    expect(
      (
        (await env.DB.prepare("SELECT sent_at FROM outbox WHERE job_id=?")
          .bind(j.id)
          .first()) as any
      ).sent_at,
    ).not.toBeNull();
  });
  it("streams a multi-part image archive and pins images until export expiry", async () => {
    const a = new Client();
    const u = await a.register(),
      imgId = crypto.randomUUID(),
      key = u.user.id + "/" + imgId + "/original";
    const bytes = new Uint8Array(6 * 1024 * 1024).fill(23);
    await env.PRIVATE_FILES.put(key, bytes);
    await env.DB.prepare(
      "INSERT INTO images(id,user_id,request_id,state,object_key,thumb_key,mime,reservation,created_at,expires_at) VALUES(?,?,?,'pending',?,?,'image/png',?,'2026-11-01','2099-01-01')",
    )
      .bind(imgId, u.user.id, imgId, key, key + "thumb", bytes.length)
      .run();
    await env.DB.prepare(
      "UPDATE images SET state='ready',width=2,height=2,bytes=?,original_bytes=?,sha256=? WHERE id=?",
    )
      .bind(bytes.length, bytes.length, bytesToHex(sha256(bytes)), imgId)
      .run();
    const j: any = await (
      await a.call("/api/exports", "POST", { requestId: "image" })
    ).json();
    expect((await a.call("/api/images/" + imgId, "DELETE", {})).status).toBe(
      409,
    );
    await runExport(env, j.id);
    const r = await a.call("/api/exports/" + j.id + "/download");
    expect(r.status).toBe(200);
    const zip = unzipSync(new Uint8Array(await r.arrayBuffer()));
    expect(zip["images/" + imgId + ".png"].byteLength).toBe(6291456);
    expect(bytesToHex(sha256(zip["images/" + imgId + ".png"]))).toBe(
      bytesToHex(sha256(bytes)),
    );
  });
});
