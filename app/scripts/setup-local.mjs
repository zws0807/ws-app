import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".dev.vars")) console.log("已保留现有本机配置，不覆盖秘密。");
else {
  writeFileSync(
    ".dev.vars",
    "SESSION_SECRET=" +
      randomBytes(32).toString("hex") +
      "\nTURNSTILE_SECRET=1x0000000000000000000000000000000AA\n",
    { mode: 0o600, flag: "wx" },
  );
  console.log("本机开发配置已生成（未显示秘密）。");
}
