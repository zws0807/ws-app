import { expect, type Page } from "@playwright/test";
export const testPassword = "e2e-private-password";
export async function register(page: Page) {
  const username = "e2e" + crypto.randomUUID().slice(0, 12);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "注册新账号", exact: true })
    .press("Enter");
  await page.getByLabel("用户名", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(testPassword);
  await page
    .getByRole("button", { name: "创建账号", exact: true })
    .press("Enter");
  await expect(page.getByText("请保存你的恢复码")).toBeVisible();
  await page.getByRole("button", { name: "我已妥善保存" }).press("Enter");
  await expect(page.getByTestId("board-save")).toContainText("已保存");
  return username;
}
