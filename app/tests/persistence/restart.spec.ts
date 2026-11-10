import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { register, testPassword } from "../e2e/helpers";
const filename = ".cache/persistence-qa.json";
test("two accounts retain private records across a server restart", async ({
  page,
  browser,
}) => {
  if (process.env.PERSISTENCE_STAGE === "seed") {
    const accounts = [];
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext();
      const tab = await context.newPage();
      const username = await register(tab);
      const me = await (await tab.request.get("/api/auth/me")).json();
      const headers = {
        origin: "http://127.0.0.1:5173",
        "x-csrf-token": me.csrfToken,
      };
      const board = {
        version: 0,
        height: 520,
        elements: [
          {
            id: crypto.randomUUID(),
            type: "text",
            text: "重启保留账号" + i,
            x: 24,
            y: 24,
            width: 240,
            height: 100,
            z: 1,
            lit: false,
          },
        ],
      };
      const saved = await tab.request.put("/api/board", {
        headers,
        data: board,
      });
      expect(saved.status()).toBe(200);
      const journal = await tab.request.post("/api/journal", {
        headers,
        data: {
          date: "2026-11-03",
          body: "重启保留日记" + i,
          requestId: crypto.randomUUID(),
        },
      });
      expect(journal.status()).toBe(201);
      const image = await tab.request.post("/api/images", {
        headers: { ...headers, "x-request-id": crypto.randomUUID() },
        multipart: {
          file: {
            name: "pink.png",
            mimeType: "image/png",
            buffer: await readFile("tests/fixtures/pink.png"),
          },
        },
      });
      expect(image.status()).toBe(201);
      accounts.push({
        username,
        board: await saved.json(),
        journal: await journal.json(),
        image: await image.json(),
      });
      await context.close();
    }
    await mkdir(".cache", { recursive: true });
    await writeFile(filename, JSON.stringify(accounts), { mode: 0o600 });
    return;
  }
  const accounts = JSON.parse(await readFile(filename, "utf8"));
  for (let i = 0; i < accounts.length; i++) {
    const context = await browser.newContext();
    const tab = await context.newPage();
    const account = accounts[i],
      other = accounts[1 - i];
    await tab.goto("/", { waitUntil: "domcontentloaded" });
    await tab.getByLabel("用户名", { exact: true }).fill(account.username);
    await tab.getByLabel("密码", { exact: true }).fill(testPassword);
    await tab.getByRole("button", { name: "登录自己的空间" }).press("Enter");
    await expect(
      tab.getByRole("button", {
        name: account.board.elements[0].text,
        exact: true,
      }),
    ).toBeVisible();
    expect(await (await tab.request.get("/api/board")).json()).toEqual(
      account.board,
    );
    const journals = await (await tab.request.get("/api/journal")).json();
    expect(journals.entries).toHaveLength(1);
    expect(journals.entries[0].body).toBe(account.journal.body);
    expect(
      (
        await tab.request.get("/api/images/" + account.image.id + "/content")
      ).status(),
    ).toBe(200);
    expect(
      (
        await tab.request.get("/api/images/" + other.image.id + "/content")
      ).status(),
    ).toBe(404);
    await context.close();
  }
});
