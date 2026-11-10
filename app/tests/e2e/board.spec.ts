import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { register, testPassword } from "./helpers";
test("three images and five texts retain geometry, lighting and deletion undo across login", async ({
  page,
}) => {
  const username = await register(page);
  await page
    .getByRole("button", { name: "我的愿望", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("heading", { name: "让向往，有一个形状" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "添加愿望", exact: true }),
  ).toBeEnabled();
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("button", { name: "添加愿望", exact: true })
      .press("Enter");
    await page
      .getByRole("button", { name: "一张图片", exact: true })
      .press("Enter");
    await page
      .getByLabel("上传图片")
      .setInputFiles(resolve("tests/fixtures/pink.png"));
    await page.getByRole("button", { name: "上传到我的图片" }).press("Enter");
    await expect(
      page.getByRole("button", { name: "放入愿望板", exact: true }),
    ).toHaveCount(i + 1);
    await page
      .getByRole("button", { name: "放入愿望板", exact: true })
      .first()
      .press("Enter");
    await expect(page.getByTestId("board-save")).toContainText("已保存");
  }
  for (let i = 0; i < 5; i++) {
    await page
      .getByRole("button", { name: "添加愿望", exact: true })
      .press("Enter");
    await page
      .getByRole("button", { name: "一句话", exact: true })
      .press("Enter");
    await page.getByLabel("愿望文字").fill("独立文字愿望" + i);
    await page
      .getByRole("button", { name: "放入愿望板", exact: true })
      .press("Enter");
    await expect(page.getByTestId("board-save")).toContainText("已保存");
  }
  await expect(page.locator(".vision-element")).toHaveCount(8);
  await page.getByLabel("横向位置").fill("120");
  await page.getByLabel("宽度", { exact: true }).fill("280");
  await page
    .getByRole("button", { name: "✦ 点亮愿望", exact: true })
    .press("Enter");
  await expect(page.getByTestId("board-save")).toContainText("已保存");
  await page
    .getByRole("button", { name: "删除愿望", exact: true })
    .press("Enter");
  await expect(page.locator(".vision-element")).toHaveCount(7);
  await page
    .getByRole("button", { name: "撤销删除", exact: true })
    .press("Enter");
  await expect(page.getByTestId("board-save")).toContainText("已保存");
  // Exercise actual pointer dragging and resizing as well as numeric controls.
  const target = page.locator(".vision-element.text").last();
  await target.focus();
  const box = await target.boundingBox();
  if (!box) throw new Error("wish missing");
  const oldX = Number(await page.getByLabel("横向位置").inputValue());
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 45, box.y + 25, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByLabel("横向位置")).not.toHaveValue(String(oldX));
  const oldWidth = Number(
    await page.getByLabel("宽度", { exact: true }).inputValue(),
  );
  const handle = await page
    .getByRole("button", { name: "拖动缩放" })
    .boundingBox();
  if (!handle) throw new Error("resize handle missing");
  await page.mouse.move(handle.x + 4, handle.y + 4);
  await page.mouse.down();
  await page.mouse.move(handle.x + 20, handle.y + 10, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByLabel("宽度", { exact: true })).not.toHaveValue(
    String(oldWidth),
  );
  await expect(page.getByTestId("board-save")).toContainText("已保存");
  await page.screenshot({
    path: "docs/verification/board.png",
    fullPage: true,
  });
  const before = await (await page.request.get("/api/board")).json();
  expect(before.elements).toHaveLength(8);
  expect(before.elements.filter((e: any) => e.lit)).toHaveLength(1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".vision-element.image")).toHaveCount(3);
  await page.getByRole("button", { name: "退出", exact: true }).press("Enter");
  await page.getByLabel("用户名", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "登录自己的空间" }).press("Enter");
  await expect(page.locator(".vision-element")).toHaveCount(8);
  const after = await (await page.request.get("/api/board")).json();
  expect(after).toEqual(before);
});
