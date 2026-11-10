import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import worker from "../../worker/src/index";
import { runExport } from "../../jobs/src/export";
import { cleanup } from "../../jobs/src/cleanup";
import { Client, origin } from "./helpers";

it("keeps committed image objects when the ready response is lost", async () => {
  const c = new Client();
  const u = await c.register();
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP433AAiBggFAA/7gj9rLf4agAAAABJRU5ErkJggg==",
    ),
    (v) => v.charCodeAt(0),
  );
  let injected = false;
  const db = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === "prepare")
        return (sql: string) => {
          const statement = target.prepare(sql);
          if (!sql.startsWith("UPDATE images SET state='ready'"))
            return statement;
          return {
            bind(...values: unknown[]) {
              const bound = statement.bind(...values);
              return {
                async run() {
                  const result = await bound.run();
                  injected = true;
                  throw new Error("lost_commit_response");
                },
              };
            },
          };
        };
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const form = new FormData();
  form.set("file", new File([png], "test.png", { type: "image/png" }));
  await worker.fetch(
    new Request(origin + "/api/images", {
      method: "POST",
      headers: {
        origin,
        cookie: c.cookie,
        "x-csrf-token": c.csrf,
        "x-request-id": crypto.randomUUID(),
      },
      body: form,
    }),
    { ...env, DB: db } as never,
  );
  expect(injected).toBe(true);
  const row = await env.DB.prepare(
    "SELECT * FROM images WHERE user_id=? AND state='ready'",
  )
    .bind(u.user.id)
    .first<any>();
  expect(row).toBeTruthy();
  expect(await env.PRIVATE_FILES.head(row.object_key)).not.toBeNull();
  expect(await env.PRIVATE_FILES.head(row.thumb_key)).not.toBeNull();
  expect((await c.call("/api/images/" + row.id + "/content")).status).toBe(200);
});

async function abandonedArchive(expired = false) {
  const c = new Client();
  await c.register();
  const job: any = await (
    await c.call("/api/exports", "POST", { requestId: crypto.randomUUID() })
  ).json();
  const key = "abandoned/" + job.id + ".zip";
  const multipart = await env.EXPORT_FILES.createMultipartUpload(key);
  const part = await multipart.uploadPart(1, new Uint8Array([1, 2, 3]));
  await multipart.complete([part]);
  await env.DB.prepare(
    "UPDATE export_jobs SET status='running',upload_key=?,upload_id=?,lease_token='crashed',lease_until='2000-01-01',expires_at=? WHERE id=?",
  )
    .bind(
      key,
      multipart.uploadId,
      expired ? "2000-01-01" : "2099-01-01",
      job.id,
    )
    .run();
  return { c, job, key };
}
it("removes a completed abandoned archive before retrying a crashed export", async () => {
  const { c, job, key } = await abandonedArchive();
  await runExport(env, job.id);
  expect(await env.EXPORT_FILES.head(key)).toBeNull();
  expect((await c.call("/api/exports/" + job.id + "/download")).status).toBe(
    200,
  );
});
it("cleans completed abandoned archives when their job expires", async () => {
  const { key } = await abandonedArchive(true);
  await cleanup(env);
  expect(await env.EXPORT_FILES.head(key)).toBeNull();
});
it("rejects changed journal payloads under a previous retry key", async () => {
  const c = new Client();
  await c.register();
  const data = {
    date: "2026-11-03",
    body: "committed text",
    requestId: crypto.randomUUID(),
  };
  expect((await c.call("/api/journal", "POST", data)).status).toBe(201);
  expect((await c.call("/api/journal", "POST", data)).status).toBe(200);
  const changed = await c.call("/api/journal", "POST", {
    ...data,
    body: "new unsaved text",
  });
  expect(changed.status).toBe(409);
  expect(((await changed.json()) as any).code).toBe("request_payload_changed");
  expect(
    ((await (await c.call("/api/journal")).json()) as any).entries,
  ).toHaveLength(1);
});

it("paginates private library without dropping older images", async () => {
  const c = new Client();
  const u = await c.register();
  const insert = [];
  for (let i = 0; i < 51; i++) {
    const iid = crypto.randomUUID();
    insert.push(
      env.DB.prepare(
        "INSERT INTO images(id,user_id,request_id,state,object_key,thumb_key,mime,reservation,created_at,expires_at) VALUES(?,?,?,'pending',?,?,'image/png',0,'2026-11-03','2099-01-01')",
      ).bind(iid, u.user.id, iid, iid, iid + "thumb"),
    );
    insert.push(
      env.DB.prepare(
        "UPDATE images SET state='ready',width=2,height=2,bytes=1,original_bytes=1 WHERE id=?",
      ).bind(iid),
    );
  }
  await env.DB.batch(insert);
  const first: any = await (await c.call("/api/images")).json();
  expect(first.images).toHaveLength(50);
  expect(first.nextCursor).toBeTruthy();
  const second: any = await (
    await c.call("/api/images?before=" + first.nextCursor)
  ).json();
  expect(second.images).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(
    new Set([...first.images, ...second.images].map((i: any) => i.id)).size,
  ).toBe(51);
  const other = new Client();
  await other.register();
  expect(
    (await other.call("/api/images?before=" + first.nextCursor)).status,
  ).toBe(404);
});
it("keeps a ready ZIP when its database commit response is lost", async () => {
  const c = new Client();
  await c.register();
  const job: any = await (
    await c.call("/api/exports", "POST", { requestId: crypto.randomUUID() })
  ).json();
  let injected = false;
  const db = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === "prepare")
        return (sql: string) => {
          const statement = target.prepare(sql);
          if (!sql.startsWith("UPDATE export_jobs SET status='ready'"))
            return statement;
          return {
            bind(...values: unknown[]) {
              const bound = statement.bind(...values);
              return {
                async first() {
                  await bound.first();
                  injected = true;
                  throw new Error("lost_commit_response");
                },
              };
            },
          };
        };
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  await runExport({ ...env, DB: db } as never, job.id).catch(() => {});
  expect(injected).toBe(true);
  const status: any = await (await c.call("/api/exports/" + job.id)).json();
  expect(status.status).toBe("ready");
  expect((await c.call("/api/exports/" + job.id + "/download")).status).toBe(
    200,
  );
});
