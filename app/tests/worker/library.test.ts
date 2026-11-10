import largePng from "../fixtures/too-many-pixels.txt?raw";
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { Client } from "./helpers";
// Valid hand-checked 1x1 PNG fixture is loaded as bytes at build time.
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP433AAiBggFAA/7gj9rLf4agAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
).buffer;
export async function upload(
  c: Client,
  name = "image.png",
  bytes: Uint8Array = new Uint8Array(png),
  type = "image/png",
  requestId = crypto.randomUUID(),
) {
  const f = new FormData();
  f.set("file", new File([new Uint8Array(bytes).buffer], name, { type }));
  return c.call("/api/images", "POST", f, { "x-request-id": requestId });
}
describe("library", () => {
  it("saves private images with separate same-name IDs and thumbnail access", async () => {
    const a = new Client(),
      b = new Client();
    await a.register();
    await b.register();
    const r = await upload(a);
    expect(r.status).toBe(201);
    const x: any = await r.json();
    expect(x).toMatchObject({ width: 2, height: 2 });
    const y: any = await (await upload(a)).json();
    expect(y.id).not.toBe(x.id);
    expect((await a.call("/api/images/" + x.id + "/content")).status).toBe(200);
    expect((await a.call("/api/images/" + x.id + "/thumbnail")).status).toBe(
      200,
    );
    expect((await b.call("/api/images/" + x.id + "/content")).status).toBe(404);
    expect((await b.call("/api/images/" + x.id, "DELETE", {})).status).toBe(
      404,
    );
    expect(
      ((await (await b.call("/api/images")).json()) as any).images,
    ).toEqual([]);
    const r2 = await a.call("/api/images/" + x.id + "/content");
    expect(r2.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects spoofed formats and over-quota reservations", async () => {
    const a = new Client();
    const u = await a.register();
    expect(
      (await upload(a, "bad.jpg", new Uint8Array(png), "image/jpeg")).status,
    ).toBe(400);
    expect(
      (await upload(a, "broken.png", new Uint8Array([1, 2, 3]))).status,
    ).toBe(400);
    await env.DB.prepare(
      "UPDATE storage_usage SET used_bytes=209715200 WHERE user_id=?",
    )
      .bind(u.user.id)
      .run();
    expect((await upload(a)).status).toBe(413);
    expect(
      (
        (await env.DB.prepare(
          "SELECT reserved_bytes FROM storage_usage WHERE user_id=?",
        )
          .bind(u.user.id)
          .first()) as any
      ).reserved_bytes,
    ).toBe(0);
  });
  it("deduplicates retries and soft-deletes unreferenced images", async () => {
    const a = new Client();
    await a.register();
    const requestId = crypto.randomUUID();
    const x: any = await (
      await upload(a, "a.png", new Uint8Array(png), "image/png", requestId)
    ).json();
    const y: any = await (
      await upload(a, "a.png", new Uint8Array(png), "image/png", requestId)
    ).json();
    expect(y.id).toBe(x.id);
    expect((await a.call("/api/images/" + x.id, "DELETE", {})).status).toBe(
      200,
    );
    expect((await a.call("/api/images/" + x.id + "/content")).status).toBe(404);
  });
});

it("rejects byte and pixel limits before storing image objects", async () => {
  const c = new Client();
  const u = await c.register();
  expect(
    (await upload(c, "large.png", new Uint8Array(10 * 1024 * 1024 + 1))).status,
  ).toBe(413);
  const pixels = Uint8Array.from(atob(largePng.trim()), (v) => v.charCodeAt(0));
  expect((await upload(c, "pixels.png", pixels)).status).toBe(413);
  const rows = await env.DB.prepare(
    "SELECT * FROM images WHERE user_id=? AND state='ready'",
  )
    .bind(u.user.id)
    .all();
  expect(rows.results).toHaveLength(0);
  const usage = await env.DB.prepare(
    "SELECT used_bytes,reserved_bytes FROM storage_usage WHERE user_id=?",
  )
    .bind(u.user.id)
    .first();
  expect(usage).toMatchObject({ used_bytes: 0, reserved_bytes: 0 });
});
