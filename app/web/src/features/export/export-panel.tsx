import { useEffect, useRef, useState } from "react";
import type { ExportJob } from "../../../../shared/contracts";
import { api, errorMessage } from "../../api";
export function ExportPanel() {
  const [jobs, setJobs] = useState<(ExportJob & { requestId: string })[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef(crypto.randomUUID());
  async function load() {
    const b = await api("/exports");
    setJobs(b.jobs);
  }
  useEffect(() => {
    let active = true;
    const poll = () => {
      api("/exports")
        .then((b) => {
          if (active) setJobs(b.jobs);
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        });
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function create(requestId: string = request.current) {
    setBusy(true);
    setError("");
    try {
      await api("/exports", "POST", { requestId });
      request.current = crypto.randomUUID();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const active = jobs.some((j) => ["pending", "running"].includes(j.status));
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">YOUR WORDS BELONG TO YOU</p>
          <h2>带走自己的记录</h2>
        </div>
        <span className="badge">私人 ZIP 备份</span>
      </div>
      <p className="muted">
        完整导出愿望板、周计划、打卡、日记与自己的原始图片。密码和恢复码不会进入备份。
      </p>
      <button
        className="primary"
        disabled={busy || active}
        onClick={() => create()}
      >
        {busy ? "正在提交…" : active ? "正在准备备份…" : "导出我的数据"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="export-list">
        {jobs.map((j) => (
          <div className="export-item" key={j.id}>
            <div>
              <strong>
                {
                  {
                    pending: "等待处理",
                    running: "正在整理记录",
                    ready: "备份已准备好",
                    failed: "本次导出失败",
                    expired: "备份已过期",
                  }[j.status]
                }
              </strong>
              <p className="hint">
                {new Date(j.createdAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                })}{" "}
                · 文件保留24小时
              </p>
              {j.error && <p className="error">{j.error}</p>}
            </div>
            {j.status === "ready" &&
            new Date(j.expiresAt).getTime() > Date.now() ? (
              <button
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = "/api/exports/" + j.id + "/download";
                  a.download = "";
                  a.click();
                }}
              >
                下载完整备份
              </button>
            ) : j.status === "failed" ? (
              <button
                disabled={busy || active}
                onClick={() => create(j.requestId)}
              >
                重试这份快照
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <p className="hint">
        备份按提交时的内容生成。之后的编辑会留在应用里，可以再次导出。导入恢复将在第二批开放。
      </p>
    </section>
  );
}
