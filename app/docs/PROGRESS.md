# Cloudflare 开发进度

计划：docs/superpowers/plans/2026-11-03-cloudflare-core.md

Ruling: 用户已明确要求按确认架构继续开发，资源先留TODO；直接在当前新app目录开发，不再次询问设计/执行方式。只创建本地Git仓库及开发分支，不创建额外worktree，不操作远程资源。
Ruling: 本地绑定可使用明确标注的本地资源标识；生产部署门禁必须拒绝TODO资源、测试秘密和缺失配置，避免占位符误上线。
Pre-flight: auth produces userId/session/CSRF consumed by library/board/weekly/journal/export；全部服务端derive identity。
Pre-flight: library produces imageId/owner/state consumed by board/export；引用与删除须原子保护。
Pre-flight: export produces immutable snapshot/outbox consumed by jobs；重复消息须幂等，R2与D1失败需补偿。

- Task 1: complete（提交与验证见下文及验收记录）
- Task 2: complete（提交与验证见下文及验收记录）
- Task 3: complete（提交与验证见下文及验收记录）
- Task 4: complete（提交与验证见下文及验收记录）
- Task 5: complete（提交与验证见下文及验收记录）
- Task 6: complete（提交与验证见下文及验收记录）

Task 1: health RED 3/3 → GREEN 3/3；npm run build通过。新版官方测试包改为@cloudflare/vitest-plugin，依赖审计0漏洞；本地workerd监听端口需沙箱许可。
Ruling: 构建产物根设为dist/，仅dist/client/可作为公开静态目录；Worker产物及开发秘密位于兄弟目录且忽略提交。
Ruling: 密码采用@noble/hashes的纯TypeScript Argon2id实现（19456KiB/t2/p1），避免动态WASM编译与Workers限制；密码强度不变，付费Workers CPU实测仍列资源TODO。未使用Node原生密码库。
Task 2: auth RED 7/7→GREEN；health+auth 10/10通过，账号界面与构建通过。会话/恢复码/密码散列均在本地Workers运行时验证。云端Turnstile与CPU仍TODO。
Task 3: library RED 3/3→GREEN；health/auth/library 13/13通过。图片状态触发器会计入D1 changes，已以实际状态转换判断避免误报过期；构建通过。图库组件已实现，主界面整合与浏览器验收在Task6完成。
Task 4: board RED 2/2→GREEN；已有关联套件15/15通过，构建通过。D1单条CAS UPDATE触发原子图片引用更新，旧版本无副作用；画布交互组件已实现，浏览器验收待主界面整合。
Task 5: weekly RED 2/2→GREEN；去重打卡/撤销重放/目标次数与周隔离测试通过；周编辑与进度条组件已完成。完整Workers套件24/24通过，UI整合完成，浏览器验收进行中。
Task 6: journal/export/jobs分别观察RED后实现；冻结快照、ZIP multipart、outbox补发、图片引用固定及过期清理已通过本机Workers测试。增加公开配置/本地旁路隔离RED→GREEN 2/2。
Ruling: 系统Edge无头浏览器出现requestAnimationFrame停滞，改用项目忽略目录内的Playwright配套Chromium验收，不修改用户系统浏览器。

Ruling: Vite项目根是web/，CLI迁移根是app/；已显式共用app/.wrangler/state绝对路径，避免误用两个本地数据库。真实浏览器已验证注册和核心队列导出可用。
Ruling: 注册按来源50次/10分钟，登录/恢复账号维度仍为10次/10分钟；补齐原生近似突发限流1000次/分钟并以DO作严格计数。资源namespace仍为本地占位。
验证：完整Workers 28/28、工具1/1和双Worker+前端构建通过。浏览器核心流程与断网测试已分别通过；两个输入保留回归2/2通过。三图五文字最终验收受本机浏览器导航调度影响，正在单独复核，尚未宣称全套通过。

Final review: 独立只读审查已返回草稿、日期入口与跨服务补偿问题；按重要问题处理并进行一次修复，未派发二次审查。
Final: fixed 首次读取失败覆盖愿望板草稿 — 浏览器 initial board read failure RED→GREEN。
Final: fixed 自定义周计划刷新不可找回 — 浏览器 custom dates RED→GREEN；已保存计划入口带分页。
Final: fixed 图片 ready 提交响应丢失导致 R2 误删 — Workers keeps committed image objects RED→GREEN。
Final: fixed 已完成旧 ZIP 在重试/过期时泄漏 — 两项真实 R2 multipart 中断测试 RED→GREEN。
Final: fixed 日记旧请求键清空修改后的草稿 — API changed payload 与浏览器 lost journal response RED→GREEN。
Final: fixed 导出 ready 提交响应丢失误删 ZIP — Workers keeps a ready ZIP RED→GREEN。
Final: fixed 图库旧图片不可翻页 — Workers private library pagination RED→GREEN，50条稳定游标。
Final: fixed 全站注册预算缺失 — DO全站计数达到1000时由201变为429，RED→GREEN；窗口24小时。
Ruling: 资源留TODO，按现有授权保留本地开发分支，不合并、不推送、不发布 — 本轮交付为本机试用，后续上线独立执行。
Final: minor (deferred): 无另外返回的次要审查项；原定后续业务及远端验证仍保留TODO。
验收补充：完整Workers 36/36；合法超2400万像素PNG、超10MB文件拒绝，失败不占额度。工具1/1、重启前seed1/1、重启后双账号verify1/1通过；最终浏览器9项和构建复核进行中。
外部原型最终核对：design-preview.html摘要一致；原基线outputs/静愿两个文件路径当前不存在，不能再次比较。本轮未写这些外部路径。

Final: fixed 周切换读取失败误编辑旧周 — 浏览器 failed week switch RED→GREEN；加载/保存期间禁切周，读取失败需重试。
Final suite: Workers 36/36，工具1/1，浏览器9/9；重启seed1/1→实际停止/重启→双账号verify1/1。最终TypeScript、双Worker及前端构建通过。收尾提交保留本地分支。
Task 1: complete（0f31056..16bc8b4）
Task 2: complete（16bc8b4..02c0998）
Task 3: complete（02c0998..7b4e2c2）
Task 4: complete（7b4e2c2..c0211c2；最终浏览器三图五文字通过）
Task 5: complete（c0211c2..44b64a3；浏览器用例合并在core/recovery/saving）
Task 6: complete（44b64a3..e1d50ef及最终修复提交；完整本机验证见acceptance）
