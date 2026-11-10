# 云资源 TODO（本机开发不需要开通）

用户授权：2026-11-03 按 Cloudflare 架构开发，资源后续补充。本文件不含任何真实密钥。

- [ ] Cloudflare 账户与预算；核对 Workers Paid、D1、R2、Images、Queues、DO 的当日费用。
- [ ] staging / production 各自 D1 database ID，应用并核对 migrations。
- [ ] 私有图片桶、导出桶；禁止公开 r2.dev / 公共域名；设置临时对象清理策略。
- [ ] Images binding 远端样本验证：格式/尺寸、损坏图、动画和缩略图。
- [ ] 原生 API_RATE_LIMITER namespace（当前1001为本机占位）；核对来源与全站注册配额。
- [ ] AUTH_LIMITER DO namespace/migration；Queues 主队列与死信队列，jobs consumer 与 Cron。
- [ ] Turnstile 正式 site key / secret 与允许域名；禁止本机测试key用于生产。
- [ ] SESSION_SECRET：至少32随机字节，仅写Workers secrets，禁止进入前端与Git。
- [ ] 自有域名、APP_ORIGIN、DNS/TLS、WAF、缓存绕过私人API；三网实测。
- [ ] 独立 staging 验证密码散列CPU/内存、Turnstile、图片、队列、大文件导出与私人缓存隔离。
- [ ] GitHub 私有仓库、Workers Builds、生产迁移与回退流程。
- [ ] 日志脱敏、用量告警、服务端配额和任务失败监测。
- [ ] 上线前账号删除/数据清理流程、隐私说明、区域要求和运营备份恢复演练。

## 后续业务资源

- [ ] 第二批：信念成长、十周计划、导入恢复、运营备份、按需Workflows。
- [ ] 第三批：Access管理员门禁、会员素材与音频授权、人工会员管理、按需KV。
- [ ] AI独立批次：Workers AI、AI Gateway、Vectorize、用户数据授权与额度。

## 当前限制

所有资源标识均是本地开发占位；没有创建、绑定或部署真实云资源。远端集成未经实测，不宣称可直接公开上线。
