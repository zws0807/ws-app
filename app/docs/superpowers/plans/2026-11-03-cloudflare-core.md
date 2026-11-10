# 心流显化 Cloudflare 第一批 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task. Follow test-driven-development and verification-before-completion.

**Goal:** 在本机交付真实 Workers 运行时、持久 D1/R2、私人账号隔离的核心应用；云资源留 TODO。
**Architecture:** React/Vite + Hono Worker，D1 关系数据与私有 R2 文件，DO 限流，Images 处理图片，Queues/Cron 后台导出清理。
**Tech Stack:** TypeScript、React、Vite、Cloudflare Vite plugin、Hono、D1 SQL、Workers bindings、Vitest Workers pool、Playwright。
**Spec:** ../specs/2026-11-03-cloudflare-design.md（用户 2026-11-03 已确认按此实施）。

## Global Constraints

- 正式代码只在 app/；原型及参考文档保持不变。
- 用户已授权按架构开发，云资源先留 TODO；无需再次设计确认，不登录、不购买、不创建云资源或部署。
- 原有用户名3–32、密码12–128（密码不trim）、图片10MB/2400万像素/账号200MB、默认520px画布与中文粉紫视觉保留。
- 测试使用本地绑定与测试凭据；不把模拟结果描述为云端验收。
- 每单元 RED→GREEN，相关套件、构建通过后本地提交。

## Review Focus

1. 跨账号请求及缓存隔离；覆盖 auth/library/board/journal/export。
2. 上传中断、R2/D1跨服务失败、配额并发；覆盖 library。
3. CAS失败不得改变子表，打卡重试和撤销重放；覆盖 board/weekly。
4. 导出快照、重复投递、失败补发及文件回收；覆盖 export/jobs。
5. 断网/失败不丢草稿、退出账号清理草稿；覆盖浏览器流程。

## Task 1: Workers 本地骨架

**Files:** package.json、vite.config.ts、wrangler*.jsonc、worker/src/index.ts、env.ts、shared/contracts.ts、tests/worker/health.test.ts、db/migrations/0001_core.sql。
**Interfaces:** Worker fetch(Request,Env,ExecutionContext)；GET /api/health → {ok:true}；Env注入DB、R2与其他bindings。

- [x] 建立只含app的开发分支与忽略规则，核对原型摘要。
- [x] 写health测试：200；未知API JSON404；缺配置清楚失败。运行 npm test -- health，观察缺功能失败。
- [x] 实现入口、迁移、中文外壳、开发命令和生产资源门禁。
- [x] npm test、npm run build通过后提交。

## Task 2: 独立账号与恢复

**Files:** worker/src/features/auth/、durable-objects/auth-limiter.ts、web/src/features/auth/、tests/worker/auth.test.ts。
**Interfaces:** register/login/me/logout/recover/password；HttpOnly会话，写请求Origin+CSRF。

- [x] 写失败测试：用户名规范化冲突、密码不trim、错误登录、会话撤销、恢复码重放、旧会话失效、无明文持久化、CSRF及限流。
- [x] npm test -- auth观察失败；实现Argon2id适配与并发限制、D1会话与恢复事务、Turnstile、DO限流、页面。
- [x] npm test、npm run build通过后提交；真实云端CPU/Turnstile加入TODO。

## Task 3: 私有图片

**Files:** worker/src/features/library/、storage/、web/src/features/library/、tests/worker/library.test.ts。
**Interfaces:** POST/GET /api/images；GET /:id/content与/thumbnail；DELETE /:id。

- [x] 写失败测试：格式冒充、大小/像素/容量限制、同名独立、跨账号、引用删除拒绝、失败补偿和幂等。
- [x] npm test -- library观察失败；实现容量预留、Images校验缩略图、私有R2、状态机及清理。
- [x] npm test、npm run build通过后提交；远端Images样本验证留TODO。

## Task 4: 自由画布

**Files:** worker/src/features/board/、web/src/features/board/、components/save-status.tsx、tests/worker/board.test.ts、tests/e2e/board.spec.ts。
**Interfaces:** GET/PUT /api/board → {version,elements,height}；元素为独立text/image。

- [x] 写失败测试：八元素保存一致、越权图、无效几何、409无副作用、取消点亮、删除撤销。
- [x] npm test -- board观察失败；实现CAS、图引用、自动空位、拖动缩放、图层、输入尺寸、保存重试与冲突保留。
- [x] 浏览器验证三图五文字、移动、点亮、刷新重登和断网草稿；套件与构建通过提交。

## Task 5: 每周目标与打卡

**Files:** worker/src/features/weekly/、web/src/features/weekly/、tests/worker/weekly.test.ts、tests/e2e/weekly.spec.ts。
**Interfaces:** weeks CRUD、tasks CRUD、checkins create/delete；所有编辑version检查。

- [x] 写失败测试：0→1/3→2/3→满、相同requestId不重复、撤销重放、target缩小拒绝、独立周、无效日期、重要任务唯一。
- [x] npm test -- weekly观察失败；实现D1流水、原子限制、排序独立、北京时间日期及可靠编辑。
- [x] 接口/浏览器套件与构建通过提交。

## Task 6: 日期书写、导出及核心验收

**Files:** worker/src/features/{journal,export}/、jobs/src/、web/src/features/{journal,export}/、tests/worker/{journal,export,jobs}.test.ts、tests/e2e/core.spec.ts、README.md、RESOURCE_TODO.md。
**Interfaces:** journal CRUD；POST /api/exports →202；GET status/download；Queue jobs幂等消费，Cron补发清理。

- [x] 写失败测试：同日多条、补记、空文、冲突、越权删除、本人导出完整、凭据排除、快照不漂移、重复消息及过期清理。
- [x] 运行对应测试观察失败；实现日记、冻结快照/图片引用、outbox、ZIP流式multipart、失败重试与下载鉴权。
- [x] npm test、npm run build、npm run test:e2e；重启后两账号验证存储隔离；核对原型摘要。
- [x] 独立整体验收审阅，修复重要问题；交付运行说明、云资源TODO、明确未验证部分并提交。

最终证据及已知限制：[本机验收记录](../../verification/acceptance.md)。周计划浏览器用例合并在 core/recovery/saving.spec.ts，未另建 weekly.spec.ts。
