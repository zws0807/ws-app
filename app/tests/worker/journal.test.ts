import { describe, it, expect } from "vitest";
import { Client } from "./helpers";
import { chinaDate, naturalWeek } from "../../shared/dates";
describe("journal", () => {
  it("preserves multiple entries on the same chosen date and detects stale changes", async () => {
    const a = new Client();
    await a.register();
    expect(
      (
        await a.call("/api/journal", "POST", {
          date: "2026-02-30",
          body: "bad",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await a.call("/api/journal", "POST", {
          date: "2026-11-01",
          body: "   ",
        })
      ).status,
    ).toBe(400);
    const one: any = await (
      await a.call("/api/journal", "POST", {
        date: "2026-11-01",
        body: "今天的一点光",
      })
    ).json();
    expect(one.date).toBe("2026-11-01");
    expect(one.createdAt).not.toBe("2026-11-01");
    expect(
      (
        await a.call("/api/journal", "POST", {
          date: "2026-11-01",
          body: "同一天也可以再写",
        })
      ).status,
    ).toBe(201);
    expect(
      ((await (await a.call("/api/journal")).json()) as any).entries,
    ).toHaveLength(2);
    expect(
      (
        await a.call("/api/journal/" + one.id, "PATCH", {
          version: 0,
          date: one.date,
          body: "更完整的感受",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await a.call("/api/journal/" + one.id, "PATCH", {
          version: 0,
          date: one.date,
          body: "旧覆盖",
        })
      ).status,
    ).toBe(409);
  });
  it("prevents cross-account deletion and applies Beijing date boundaries", async () => {
    const a = new Client(),
      b = new Client();
    await a.register();
    await b.register();
    const j: any = await (
      await a.call("/api/journal", "POST", {
        date: "2026-11-01",
        body: "私人记录",
      })
    ).json();
    expect(
      (await b.call("/api/journal/" + j.id, "DELETE", { version: 0 })).status,
    ).toBe(404);
    expect(
      (await a.call("/api/journal/" + j.id, "DELETE", { version: 0 })).status,
    ).toBe(200);
    expect(
      ((await (await a.call("/api/journal")).json()) as any).entries,
    ).toEqual([]);
    expect(chinaDate(new Date("2026-11-02T16:00:00Z"))).toBe("2026-11-03");
    expect(naturalWeek("2026-11-08")).toEqual({
      startDate: "2026-11-02",
      endDate: "2026-11-08",
    });
  });
});
