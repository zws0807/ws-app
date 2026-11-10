import { describe, it, expect } from "vitest";
import { Client } from "./helpers";
async function create(c: Client) {
  const r = await c.call("/api/weeks", "POST", {
    startDate: "2026-11-02",
    endDate: "2026-11-08",
    goal: "慢慢靠近",
  });
  expect(r.status).toBe(201);
  return r.json() as Promise<any>;
}
describe("weekly", () => {
  it("counts 1/3 to full, deduplicates requests and never replays an undone checkin", async () => {
    const a = new Client();
    await a.register();
    const w = await create(a);
    let t: any = await (
      await a.call("/api/weeks/" + w.id + "/tasks", "POST", {
        title: "散步",
        target: 3,
        priority: "important",
        order: 0,
      })
    ).json();
    const first = "request-first";
    const r1: any = await (
      await a.call("/api/tasks/" + t.id + "/checkins", "POST", {
        requestId: first,
      })
    ).json();
    expect(r1.task.checkins.length).toBe(1);
    await a.call("/api/tasks/" + t.id + "/checkins", "POST", {
      requestId: first,
    });
    const second: any = await (
      await a.call("/api/tasks/" + t.id + "/checkins", "POST", {
        requestId: "second",
      })
    ).json();
    expect(second.task.checkins.length).toBe(2);
    const third: any = await (
      await a.call("/api/tasks/" + t.id + "/checkins", "POST", {
        requestId: "third",
      })
    ).json();
    expect(third.task.checkins.length).toBe(3);
    expect(
      (
        await a.call("/api/tasks/" + t.id + "/checkins", "POST", {
          requestId: "fourth",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await a.call("/api/tasks/" + t.id, "PATCH", {
          version: third.task.version,
          title: "散步",
          target: 2,
          priority: "important",
          order: 0,
        })
      ).status,
    ).toBe(409);
    await a.call(
      "/api/tasks/" + t.id + "/checkins/" + r1.checkinId,
      "DELETE",
      {},
    );
    const replay: any = await (
      await a.call("/api/tasks/" + t.id + "/checkins", "POST", {
        requestId: first,
      })
    ).json();
    expect(replay.task.checkins.length).toBe(2);
  });
  it("keeps week data independent and validates dates and stale edits", async () => {
    const a = new Client(),
      b = new Client();
    await a.register();
    await b.register();
    expect(
      (
        await a.call("/api/weeks", "POST", {
          startDate: "2026-11-08",
          endDate: "2026-11-02",
          goal: "",
        })
      ).status,
    ).toBe(400);
    const w = await create(a);
    expect(
      (
        await b.call("/api/weeks/" + w.id, "PATCH", {
          version: 0,
          startDate: "2026-11-02",
          endDate: "2026-11-08",
          goal: "intrusion",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await a.call("/api/weeks/" + w.id, "PATCH", {
          version: 0,
          startDate: "2026-11-02",
          endDate: "2026-11-08",
          goal: "新目标",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await a.call("/api/weeks/" + w.id, "PATCH", {
          version: 0,
          startDate: "2026-11-02",
          endDate: "2026-11-08",
          goal: "旧覆盖",
        })
      ).status,
    ).toBe(409);
    expect(((await (await b.call("/api/weeks")).json()) as any).weeks).toEqual(
      [],
    );
    const w2: any = await (
      await a.call("/api/weeks", "POST", {
        startDate: "2026-11-09",
        endDate: "2026-11-15",
        goal: "",
      })
    ).json();
    expect(w2.tasks).toEqual([]);
  });
});
