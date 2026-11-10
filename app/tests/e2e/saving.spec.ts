import { test, expect } from "@playwright/test";
import { register } from "./helpers";
test("journal prevents new typing from being erased while a save is in flight", async ({
  page,
}) => {
  await register(page);
  await page
    .getByRole("button", { name: "此刻的我", exact: true })
    .press("Enter");
  await page.getByLabel("此刻的感受").fill("正在保存的原文");
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/journal", async (route) => {
    if (route.request().method() === "POST") {
      await gate;
      await route.continue();
    } else await route.continue();
  });
  try {
    await page.getByRole("button", { name: "保存此刻" }).press("Enter");
    await expect(page.getByLabel("此刻的感受")).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByText("正在保存的原文", { exact: true })).toBeVisible();
});
test("failed task editor restores its input after refresh", async ({
  page,
}) => {
  await register(page);
  await page
    .getByRole("button", { name: "每周计划", exact: true })
    .press("Enter");
  await page.getByRole("button", { name: "创建这一周" }).press("Enter");
  await page.getByRole("button", { name: "添加任务" }).press("Enter");
  await page.getByLabel("任务名称").fill("保留这份任务草稿");
  await page.getByLabel("计划次数").fill("4");
  await page.route("**/api/weeks/*/tasks", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "保存任务" }).press("Enter");
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "添加任务" }).press("Enter");
  await expect(page.getByLabel("任务名称")).toHaveValue("保留这份任务草稿");
  await expect(page.getByLabel("计划次数")).toHaveValue("4");
});
