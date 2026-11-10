import { test, expect } from "@playwright/test";
import { register } from "./helpers";
test("initial board read failure preserves an existing draft and new edits", async ({
  page,
}) => {
  await register(page);
  const me = await (await page.request.get("/api/auth/me")).json();
  const key = "flow:" + me.user.id + ":board";
  const draft = {
    version: 0,
    height: 520,
    elements: [
      {
        id: crypto.randomUUID(),
        type: "text",
        text: "不能丢失的本机愿望",
        x: 24,
        y: 24,
        width: 240,
        height: 100,
        z: 1,
        lit: false,
      },
    ],
  };
  await page.evaluate(
    ({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)),
    { key, draft },
  );
  await page.route("**/api/board", (r) =>
    r.request().method() === "GET" ? r.abort("failed") : r.continue(),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("button", { name: "不能丢失的本机愿望", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "添加愿望", exact: true })
    .press("Enter");
  await page.getByLabel("愿望文字").fill("读取失败后的新愿望");
  await page
    .getByRole("button", { name: "放入愿望板", exact: true })
    .press("Enter");
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );
  expect(saved.elements.map((e: any) => e.text)).toEqual([
    "不能丢失的本机愿望",
    "读取失败后的新愿望",
  ]);
  await page.unroute("**/api/board");
  await page
    .getByRole("button", { name: "重试保存", exact: true })
    .press("Enter");
  await expect(page.getByTestId("board-save")).toContainText("已保存");
});
test("custom dates remain discoverable after reloading weekly plans", async ({
  page,
}) => {
  await register(page);
  await page
    .getByRole("button", { name: "每周计划", exact: true })
    .press("Enter");
  await page.getByLabel("开始日期", { exact: true }).fill("2026-10-21");
  await page.getByLabel("结束日期", { exact: true }).fill("2026-10-27");
  await page.getByLabel("这一周，我想靠近").fill("自定义日期的计划");
  await page.getByRole("button", { name: "创建这一周" }).press("Enter");
  await expect(page.getByRole("button", { name: "添加任务" })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .getByLabel("已保存的周计划")
    .selectOption({ label: "2026-10-21 — 2026-10-27 · 自定义日期的计划" });
  await expect(page.getByLabel("这一周，我想靠近")).toHaveValue(
    "自定义日期的计划",
  );
});
test("lost journal response followed by changed input never erases the new draft", async ({
  page,
}) => {
  await register(page);
  await page
    .getByRole("button", { name: "此刻的我", exact: true })
    .press("Enter");
  await page.getByLabel("此刻的感受").fill("服务端已保存的原文");
  let lost = false;
  await page.route("**/api/journal", async (r) => {
    if (r.request().method() === "POST" && !lost) {
      lost = true;
      await r.fetch();
      await r.abort("failed");
    } else await r.continue();
  });
  await page.getByRole("button", { name: "保存此刻" }).press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("此刻的感受").fill("后来修改的新草稿");
  await page.getByRole("button", { name: "保存此刻" }).press("Enter");
  await expect(page.getByLabel("此刻的感受")).toHaveValue("后来修改的新草稿");
  await expect(page.getByRole("alert")).toContainText("上次提交已保存");
  await page.getByRole("button", { name: "保存此刻" }).press("Enter");
  await expect(page.getByLabel("此刻的感受")).toHaveValue("");
  const entries = await (await page.request.get("/api/journal")).json();
  expect(entries.entries.map((e: any) => e.body).sort()).toEqual(
    ["服务端已保存的原文", "后来修改的新草稿"].sort(),
  );
});

test("a failed week switch cannot edit data from the previously visible week", async ({
  page,
}) => {
  await register(page);
  await page
    .getByRole("button", { name: "每周计划", exact: true })
    .press("Enter");
  await page.getByLabel("这一周，我想靠近").fill("上一周的独立目标");
  await page.getByRole("button", { name: "创建这一周" }).press("Enter");
  await expect(page.getByRole("button", { name: "添加任务" })).toBeVisible();
  await page.route("**/api/weeks?startDate=*", (r) => r.abort("failed"));
  await page
    .getByRole("button", { name: "下一周", exact: true })
    .press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("这一周，我想靠近")).toHaveCount(0);
  await page.unroute("**/api/weeks?startDate=*");
  await page.getByRole("button", { name: "重新读取这一周" }).press("Enter");
  await expect(page.getByLabel("这一周，我想靠近")).toHaveValue("");
});
