import { describe, it, expect } from "vitest";
import { Client } from "./helpers";
const elements = Array.from({ length: 8 }, (_, i) => ({
  id: "t" + i,
  type: "text",
  text: "愿望" + i,
  x: (i % 4) * 220,
  y: Math.floor(i / 4) * 150,
  width: 180,
  height: 100,
  z: i,
  lit: i === 0,
}));
describe("board", () => {
  it("roundtrips eight independent elements and rejects stale saves with no side effects", async () => {
    const a = new Client();
    await a.register();
    expect(((await (await a.call("/api/board")).json()) as any).version).toBe(
      0,
    );
    const saved = await a.call("/api/board", "PUT", {
      version: 0,
      height: 520,
      elements,
    });
    expect(saved.status).toBe(200);
    const b: any = await saved.json();
    expect(b.elements).toEqual(elements);
    expect(b.version).toBe(1);
    expect(
      (
        await a.call("/api/board", "PUT", {
          version: 0,
          height: 520,
          elements: [],
        })
      ).status,
    ).toBe(409);
    expect(
      ((await (await a.call("/api/board")).json()) as any).elements,
    ).toEqual(elements);
    const changed = [...elements.map((x) => ({ ...x, lit: false }))];
    expect(
      (
        await a.call("/api/board", "PUT", {
          version: 1,
          height: 520,
          elements: changed,
        })
      ).status,
    ).toBe(200);
    expect(
      ((await (await a.call("/api/board")).json()) as any).elements[0].lit,
    ).toBe(false);
  });
  it("isolates accounts and rejects unauthorized images and invalid geometry", async () => {
    const a = new Client(),
      b = new Client();
    await a.register();
    await b.register();
    expect(
      (
        await a.call("/api/board", "PUT", {
          version: 0,
          height: 520,
          elements: [{ ...elements[0], width: -1 }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await a.call("/api/board", "PUT", {
          version: 0,
          height: 520,
          elements: [
            { ...elements[0], type: "image", imageId: "another-user-image" },
          ],
        })
      ).status,
    ).toBe(404);
    expect(
      ((await (await b.call("/api/board")).json()) as any).elements,
    ).toEqual([]);
  });
});
