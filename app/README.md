# 心流显化 · Cloudflare 核心试用版

在自己的宇宙里，让向往一点点照进现实。

## 本轮范围

React / TypeScript / Vite + Hono Workers；D1 保存用户与记录，私有 R2 保存图片和导出，Images 检查与缩略图，DO 和原生限流分层防护，Queues / Cron 执行导出与清理。业务服务不依赖常驻 Node 服务器。

已实现本机版本：

- 用户名密码注册登录、改密、一次性恢复码、HttpOnly 会话、CSRF 与来源检查。
- 私人图片上传、容量预留、缩略图、所属账号过滤、引用保护和软删除。
- 自由愿望板：独立图文、空位排布、拖动缩放、数字位置尺寸、图层、点亮、扩展、删除撤销、版本冲突和失败草稿。
- 周计划：日期、目标、一项重要任务、排序、计划次数、去重打卡与撤销。
- 日期书写：补记、同日多条、历史修改、软删除、版本冲突、失败保留草稿。
- 异步个人 ZIP 导出：冻结快照、原图、SHA-256、分段上传、幂等任务、outbox 补发、过期清理。

年度信念、十周计划、会员、练习、音频、AI、导入恢复属于后续批次，导航明确标注。没有模拟 AI、支付、搜索或音频播放。

## 本机启动

在本仓库的 `app/` 目录执行以下步骤。Node.js 24 已验证；依赖版本已锁定。

已经完成首次安装时，可在访达中双击 `scripts/start-local.command` 启动预览。保留它打开的终端窗口，再访问 `http://127.0.0.1:5173/`；关闭终端或停止服务后，该地址会拒绝连接。

```sh
cd app
npm ci
npm run setup:local
npm run db:local
npm run dev
```

浏览器打开 `http://127.0.0.1:5173/`。请使用这个地址，当前 APP_ORIGIN 也使用此地址；切换端口或 localhost 时同时修改配置。首次运行会创建空白私人空间。可自行注册本机账号，注册后请保存恢复码。

`setup:local` 生成随机的本机会话秘密并保留现有配置，不输出秘密。`.dev.vars` 是本机文件，不能提交或发给他人。本机 Turnstile 使用测试方案；正式验证界面与服务端 Siteverify 已留接入代码，需补充真实资源后单独验收。

两个 Worker 在一个 Vite 开发服务中运行，后台队列会实际生成导出文件。迁移命令与 Vite 使用相同的 `.wrangler/state/` 持久目录；重启不会清空记录。不要删除此目录来“修复”数据库问题。

停止服务使用 Ctrl+C。服务器退出后网页不可用，再次运行 `npm run dev` 即可打开原有记录。

## 验证命令

```sh
npm test
npm run test:tools
npm run build
npm run test:browser
npm run test:e2e
```

浏览器测试使用项目 `.cache/playwright/` 中的测试浏览器，不修改系统浏览器。自动流程使用真实键盘输入，并验证鼠标拖动和缩放；预览中的原生点击与截图另外复核。若开发模块因优化缓存异常而卡住，可停止服务后运行 `npm run dev -- --force`，无需删除本机数据目录。

首次 `test:browser` 需要网络下载 Chromium。测试生成的账号和数据仅保存在本机，不进入 Git。查看[具体验收结果与限制](docs/verification/acceptance.md)。

## 云资源待补充

请看 [RESOURCE_TODO.md](RESOURCE_TODO.md)。资源 ID、域名、正式 Turnstile、正式 secrets、账户与预算、Workers Builds 均待后续补充。此仓库的 Cloudflare 应用仍处于本机开发阶段。

`wrangler.jsonc` 和 `wrangler.jobs.jsonc` 当前仅为本机配置。`npm run deploy` 会明确阻止发布，生产配置及权限需在独立上线阶段核对；不要直接绕过门禁发布本机配置。

## 数据与安全边界

- 所有私人 API 与文件禁止共享缓存；R2 桶应始终保持私有。
- 图片默认每张 10MB、最多2400万像素、每账号200MB；软删除图片在实际回收前占用容量，默认7天后由清理任务回收。
- 本机 `wrangler dev` / Miniflare 和 Images 模拟不能代替云端验证；CPU、内存、真实 Turnstile、图片、队列、大文件和大陆访问需完成 staging 验收。
- ZIP 文件保留24小时，包含当时快照与原图，不包含密码、会话或恢复码。导入恢复第二批提供。
- 草稿按账号分区；退出会提示未提交草稿并清理本机副本。共享电脑上请退出账号。
- D1 Time Travel 不覆盖 R2，完整运营备份和联合恢复演练第二批实现；本机测试不是生产就绪证明。

最新版手账界面和本地音频后台请见[仓库首页](../README.md)。
