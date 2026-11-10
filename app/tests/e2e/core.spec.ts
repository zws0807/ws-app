import { test, expect } from "@playwright/test";
import { register } from "./helpers";

test("private board, weekly checkins, dated writing and export survive refresh", async ({
  page,
}) => {
  await register(page);
  await page
    .getByRole("button", { name: "添加愿望", exact: true })
    .press("Enter");
  await page.getByLabel("愿望文字").fill("我的生活有光");
  await page.getByRole("button", { name: "放入愿望板" }).press("Enter");
  await expect(
    page.getByRole("button", { name: "我的生活有光", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("board-save")).toContainText("已保存");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("button", { name: "我的生活有光", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "每周计划", exact: true })
    .press("Enter");
  await page.getByRole("button", { name: "创建这一周" }).press("Enter");
  await page.getByRole("button", { name: "添加任务" }).press("Enter");
  await page.getByLabel("任务名称").fill("散步");
  await page.getByLabel("计划次数").fill("3");
  await page.getByRole("button", { name: "保存任务" }).press("Enter");
  await page.getByRole("button", { name: "为散步打卡" }).press("Enter");
  await expect(
    page.getByRole("progressbar", { name: "散步进度" }),
  ).toHaveAttribute("aria-valuenow", "1");
  await page.getByRole("button", { name: "撤销散步上次打卡" }).press("Enter");
  await expect(
    page.getByRole("progressbar", { name: "散步进度" }),
  ).toHaveAttribute("aria-valuenow", "0");
  await page
    .getByRole("button", { name: "此刻的我", exact: true })
    .press("Enter");
  await page.getByLabel("此刻的感受").fill("今天，我愿意慢一点。");
  await page.getByRole("button", { name: "保存此刻" }).press("Enter");
  await expect(
    page.getByText("今天，我愿意慢一点。", { exact: true }),
  ).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByText("今天，我愿意慢一点。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "账号与数据" }).press("Enter");
  await page.getByRole("button", { name: "导出我的数据" }).press("Enter");
  await expect(page.getByRole("button", { name: "下载完整备份" })).toBeVisible({
    timeout: 30000,
  });
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载完整备份" }).press("Enter");
  expect((await downloaded).suggestedFilename()).toMatch(/\.zip$/);
});
test("offline board failure keeps text and retries after reconnect", async ({
  page,
  context,
}) => {
  await register(page);
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "添加愿望", exact: true })
    .press("Enter");
  await page.getByLabel("愿望文字").fill("断网也不丢失");
  await page.getByRole("button", { name: "放入愿望板" }).press("Enter");
  await expect(page.getByTestId("board-save")).toContainText("保存失败");
  await expect(
    page.getByRole("button", { name: "断网也不丢失", exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "重试保存" }).press("Enter");
  await expect(page.getByTestId("board-save")).toContainText("已保存");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("button", { name: "断网也不丢失", exact: true }),
  ).toBeVisible();
});
