import { readFileSync } from "node:fs";
const configs = ["wrangler.jsonc", "wrangler.jobs.jsonc"];
const problems = [];
for (const file of configs) {
  let c;
  try {
    c = JSON.parse(
      readFileSync(new URL("../" + file, import.meta.url), "utf8"),
    );
  } catch {
    problems.push(file + " 未就绪");
    continue;
  }
  if (c.vars?.APP_ENV !== "production")
    problems.push(file + " 不是经确认的production配置");
  if (
    JSON.stringify(c).includes("TODO") ||
    JSON.stringify(c).includes("flow-local")
  )
    problems.push(file + " 包含本地/TODO资源");
  if (!c.vars?.APP_ORIGIN?.startsWith("https://"))
    problems.push(file + " 未配置正式HTTPS域名");
  if (c.vars?.TURNSTILE_SITE_KEY?.startsWith("1x000"))
    problems.push(file + " 仍在使用测试Turnstile");
}
if (problems.length) {
  console.error(
    "部署已阻止：请先完成 RESOURCE_TODO.md，使用独立生产配置并核对云资源。\n" +
      problems.map((x) => " • " + x).join("\n"),
  );
  process.exit(1);
}
console.error(
  "部署已阻止：此项目尚未完成远端验收与生产发布授权，请按 RESOURCE_TODO.md 的上线流程单独配置发布。",
);
process.exit(1);
