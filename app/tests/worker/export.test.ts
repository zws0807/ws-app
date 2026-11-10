import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { unzipSync, strFromU8 } from "fflate";
import { Client } from "./helpers";
import { runExport } from "../../jobs/src/export";
describe("export", () => {
  it("exports only the requesting account, freezes a snapshot and excludes credentials", async () => {
    const a = new Client(),
      b = new Client();
    const u = await a.register();
    await b.register();
    await a.call("/api/journal", "POST", {
      date: "2026-11-01",
      body: "导出时的内容",
    });
    await b.call("/api/journal", "POST", {
      date: "2026-11-01",
      body: "其他人的隐私",
    });
    const r = await a.call("/api/exports", "POST", { requestId: "once" });
    expect(r.status).toBe(202);
    const job: any = await r.json();
    await a.call("/api/journal", "POST", {
      date: "2026-11-01",
      body: "之后才添加的内容",
    });
    expect((await b.call("/api/exports/" + job.id)).status).toBe(404);
    await runExport(env, job.id);
    await runExport(env, job.id);
    const status: any = await (await a.call("/api/exports/" + job.id)).json();
    expect(status.status).toBe("ready");
    const dl = await a.call("/api/exports/" + job.id + "/download");
    expect(dl.status).toBe(200);
    const zip = unzipSync(new Uint8Array(await dl.arrayBuffer()));
    const content = strFromU8(zip["manifest.json"]);
    const manifest = JSON.parse(content);
    expect(manifest.schemaVersion).toBe(1);
    expect(content).toContain("导出时的内容");
    expect(content).not.toContain("之后才添加的内容");
    expect(content).not.toContain("其他人的隐私");
    expect(content).not.toContain(u.recoveryCode);
    expect(content).not.toContain("password");
    expect(content).not.toContain("token_hash");
    expect(dl.headers.get("cache-control")).toContain("no-store");
  });
  it("deduplicates export requests and prevents simultaneous builds", async () => {
    const a = new Client();
    await a.register();
    const x: any = await (
      await a.call("/api/exports", "POST", { requestId: "same" })
    ).json();
    const y: any = await (
      await a.call("/api/exports", "POST", { requestId: "same" })
    ).json();
    expect(x.id).toBe(y.id);
    expect(
      (await a.call("/api/exports", "POST", { requestId: "another" })).status,
    ).toBe(409);
    expect((await a.call("/api/exports/" + x.id + "/download")).status).toBe(
      409,
    );
  });
});
