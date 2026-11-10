import { useEffect, useRef, useState } from "react";
import type { Week, Task } from "../../../../shared/contracts";
import { chinaDate, naturalWeek, shiftDate } from "../../../../shared/dates";
import { api, ApiError, errorMessage } from "../../api";
import { Modal } from "../../components/modal";
import { SaveStatus, type SaveState } from "../../components/save-status";
export function WeeklyPanel({ userId }: { userId: string }) {
  const [anchor, setAnchor] = useState(naturalWeek().startDate),
    [week, setWeek] = useState<Week | null>(null),
    [savedWeeks, setSavedWeeks] = useState<Week[]>([]),
    [weekCursor, setWeekCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [loadFailed, setLoadFailed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [editing, setEditing] = useState<Task | "new" | null>(null),
    [state, setState] = useState<SaveState>("saved"),
    [draft, setDraft] = useState({
      startDate: anchor,
      endDate: shiftDate(anchor, 6),
      goal: "",
    });
  const dirty = useRef(false),
    baseVersion = useRef(0),
    requestKeys = useRef<Record<string, string>>({});
  const draftKey = "flow:" + userId + ":week:" + anchor;
  const [editReset, setEditReset] = useState(0);
  async function listWeeks(older = false) {
    const b = await api(
      "/weeks" + (older && weekCursor ? "?before=" + weekCursor : ""),
    );
    setSavedWeeks((v) => (older ? [...v, ...b.weeks] : b.weeks));
    setWeekCursor(b.nextCursor);
  }
  async function load(rebase = false) {
    setLoading(true);
    setLoadFailed(false);
    setError("");
    try {
      const b = await api("/weeks?startDate=" + anchor);
      const full = b.weeks[0]
        ? await api<Week>("/weeks/" + b.weeks[0].id)
        : null;
      setWeek(full);
      await listWeeks();
      let saved: any = null;
      try {
        saved = JSON.parse(localStorage.getItem(draftKey) || "null");
      } catch {}
      setDraft(
        saved?.values || {
          startDate: full?.startDate || anchor,
          endDate: full?.endDate || shiftDate(anchor, 6),
          goal: full?.goal || "",
        },
      );
      baseVersion.current = rebase
        ? (full?.version ?? 0)
        : (saved?.version ?? full?.version ?? 0);
      if (rebase && saved)
        localStorage.setItem(
          draftKey,
          JSON.stringify({ ...saved, version: baseVersion.current }),
        );
      dirty.current = !!saved;
      setState(
        saved
          ? saved.version !== (full?.version ?? 0) && !rebase
            ? "conflict"
            : "dirty"
          : "saved",
      );
    } catch (e) {
      setLoadFailed(true);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [anchor]);
  function change(next: typeof draft) {
    setDraft(next);
    dirty.current = true;
    setState("dirty");
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ version: baseVersion.current, values: next }),
      );
    } catch {
      setError("浏览器草稿空间不足，请及时保存。");
    }
  }
  async function save() {
    setBusy("week");
    setState("saving");
    setError("");
    try {
      const saved = await api<Week>(
        "/weeks" + (week ? "/" + week.id : ""),
        week ? "PATCH" : "POST",
        { ...draft, ...(week ? { version: baseVersion.current } : {}) },
      );
      setWeek(saved);
      baseVersion.current = saved.version;
      dirty.current = false;
      localStorage.removeItem(draftKey);
      setState("saved");
      await listWeeks();
    } catch (e) {
      setState(
        e instanceof ApiError && e.status === 409 ? "conflict" : "failed",
      );
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    if (week && dirty.current && state === "dirty" && !busy) {
      const timer = setTimeout(() => save(), 700);
      return () => clearTimeout(timer);
    }
  }, [draft, week?.id, state, busy]);
  async function switchWeek(days: number) {
    if (busy || loading) return;
    if (
      dirty.current &&
      !window.confirm("当前周有未提交草稿，草稿已留在本机。仍要切换周吗？")
    )
      return;
    setAnchor(shiftDate(anchor, days));
    setError("");
  }
  async function action(t: Task, undo = false) {
    if (busy) return;
    setBusy(t.id);
    setError("");
    try {
      if (undo)
        await api(
          "/tasks/" + t.id + "/checkins/" + t.checkins.at(-1)!.id,
          "DELETE",
          {},
        );
      else {
        requestKeys.current[t.id] ??= crypto.randomUUID();
        await api("/tasks/" + t.id + "/checkins", "POST", {
          requestId: requestKeys.current[t.id],
        });
        delete requestKeys.current[t.id];
      }
      const full = await api<Week>("/weeks/" + week!.id);
      setWeek(full);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  async function submitTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!week || !editing) return;
    const f = new FormData(e.currentTarget);
    setBusy("edit");
    setError("");
    try {
      await api(
        editing === "new"
          ? "/weeks/" + week.id + "/tasks"
          : "/tasks/" + editing.id,
        editing === "new" ? "POST" : "PATCH",
        {
          title: f.get("title"),
          target: Number(f.get("target")),
          priority: f.get("priority"),
          order: Number(f.get("order")),
          ...(editing === "new"
            ? {}
            : { version: taskDraft?.version ?? editing.version }),
        },
      );
      setWeek(await api("/weeks/" + week.id));
      localStorage.removeItem(taskKey);
      setEditing(null);
    } catch (e) {
      setError(errorMessage(e));
      localStorage.setItem(
        taskKey,
        JSON.stringify({
          version:
            taskDraft?.version ?? (editing === "new" ? 0 : editing.version),
          values: Object.fromEntries(f),
        }),
      );
    } finally {
      setBusy("");
    }
  }
  async function remove(t: Task) {
    if (!window.confirm("移除此项任务？打卡历史仍保留在后台。")) return;
    try {
      await api("/tasks/" + t.id, "DELETE", { version: t.version });
      setWeek(await api("/weeks/" + week!.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const taskKey =
    "flow:" +
    userId +
    ":task:" +
    (week?.id || anchor) +
    ":" +
    (editing === "new" ? "new" : editing?.id || "");
  let taskDraft: any = null;
  try {
    taskDraft = JSON.parse(localStorage.getItem(taskKey) || "null");
  } catch {}
  const tasks = week
    ? [...week.tasks].sort(
        (a, b) =>
          (a.priority === "important" ? -1 : 0) -
            (b.priority === "important" ? -1 : 0) || a.order - b.order,
      )
    : [];
  return (
    <section className="panel weekly-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">SMALL STEPS, REAL CHANGE</p>
          <h2>每周计划</h2>
        </div>
        <div className="week-switch">
          <button
            disabled={!!busy || loading}
            aria-label="上一周"
            onClick={() => switchWeek(-7)}
          >
            ←
          </button>
          <span>
            {anchor.slice(5).replace("-", ".")} —{" "}
            {shiftDate(anchor, 6).slice(5).replace("-", ".")}
          </span>
          <button
            disabled={!!busy || loading}
            aria-label="下一周"
            onClick={() => switchWeek(7)}
          >
            →
          </button>
        </div>
      </div>
      <div className="row dates">
        <label>
          已保存的周计划
          <select
            value={savedWeeks.some((w) => w.startDate === anchor) ? anchor : ""}
            disabled={loading || !!busy}
            onChange={(e) => {
              if (!e.target.value) return;
              if (
                dirty.current &&
                !window.confirm("草稿已留在本机，仍要切换计划吗？")
              )
                return;
              setAnchor(e.target.value);
            }}
          >
            <option value="">选择已保存的计划</option>
            {savedWeeks.map((w) => (
              <option key={w.id} value={w.startDate}>
                {w.startDate} — {w.endDate} · {w.goal || "未填写目标"}
              </option>
            ))}
          </select>
        </label>
        {weekCursor && (
          <button
            disabled={loading || !!busy}
            onClick={() =>
              listWeeks(true).catch((e) => setError(errorMessage(e)))
            }
          >
            更早的周计划
          </button>
        )}
      </div>
      {loading ? (
        <p className="muted">正在读取这一周…</p>
      ) : loadFailed ? (
        <div className="empty-copy">
          <p>这一周暂时未能读取，本机草稿已保留。</p>
          <button onClick={() => load()}>重新读取这一周</button>
        </div>
      ) : (
        <>
          <div className="row dates">
            <label>
              开始日期
              <input
                disabled={busy === "week"}
                type="date"
                value={draft.startDate}
                onChange={(e) =>
                  change({ ...draft, startDate: e.target.value })
                }
              />
            </label>
            <span>—</span>
            <label>
              结束日期
              <input
                disabled={busy === "week"}
                type="date"
                value={draft.endDate}
                onChange={(e) => change({ ...draft, endDate: e.target.value })}
              />
            </label>
          </div>
          <label className="goal-label">
            这一周，我想靠近
            <input
              disabled={busy === "week"}
              value={draft.goal}
              placeholder="为自己选一个温柔而清晰的方向"
              maxLength={3000}
              onChange={(e) => change({ ...draft, goal: e.target.value })}
            />
          </label>
          <div className="row between">
            <SaveStatus state={state} onRetry={save} />
            <button
              className={week ? "small" : "primary"}
              disabled={!!busy}
              onClick={save}
            >
              {week ? "保存周目标" : "创建这一周"}
            </button>
          </div>
          {state === "conflict" && (
            <div className="conflict-box">
              <p>
                草稿已保留。重新读取后，你可以比较并手动合并；不会自动覆盖新版本。
              </p>
              <p>服务器目标：{week?.goal || "（空白）"}</p>
              <button onClick={() => load(true)}>
                保留我的草稿，以最新版本重试
              </button>
              <button
                onClick={() => {
                  if (window.confirm("放弃这份本机周目标草稿？")) {
                    localStorage.removeItem(draftKey);
                    load();
                  }
                }}
              >
                放弃草稿，读取服务器内容
              </button>
            </div>
          )}
          {week && (
            <>
              <div className="task-list">
                {tasks.length === 0 ? (
                  <p className="muted empty-copy">
                    少一点也很好。先选择一个真正重要的行动。
                  </p>
                ) : (
                  tasks.map((t) => (
                    <article key={t.id} className="task-row">
                      <div className="row between">
                        <div>
                          <p className={"task-priority " + t.priority}>
                            {t.priority === "important"
                              ? "重要任务"
                              : "中等任务"}
                          </p>
                          <h3>{t.title}</h3>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setEditing(t)}
                        >
                          编辑
                        </button>
                      </div>
                      <div
                        className="task-progress"
                        role="progressbar"
                        aria-label={t.title + "进度"}
                        aria-valuemin={0}
                        aria-valuemax={t.target}
                        aria-valuenow={t.checkins.length}
                      >
                        <i
                          style={{
                            width:
                              Math.min(
                                100,
                                (t.checkins.length / t.target) * 100,
                              ) + "%",
                          }}
                        />
                      </div>
                      <div className="row between">
                        <span className="hint">
                          {t.checkins.length >= t.target
                            ? "这一步，已经完成。"
                            : "按自己的节奏，再靠近一点。"}
                        </span>
                        <div className="row">
                          {!!t.checkins.length && (
                            <button
                              className="text-button"
                              disabled={!!busy}
                              aria-label={"撤销" + t.title + "上次打卡"}
                              onClick={() => action(t, true)}
                            >
                              撤销
                            </button>
                          )}
                          <button
                            className={
                              t.checkins.length >= t.target
                                ? "small"
                                : "primary small"
                            }
                            disabled={!!busy || t.checkins.length >= t.target}
                            aria-label={"为" + t.title + "打卡"}
                            onClick={() => action(t)}
                          >
                            {" "}
                            {t.checkins.length >= t.target
                              ? "✓ 已完成"
                              : "＋ 打卡"}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
              <button className="add-task" onClick={() => setEditing("new")}>
                ＋ 添加任务
              </button>
            </>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {editing && (
        <Modal
          title={editing === "new" ? "添加本周行动" : "编辑本周行动"}
          onClose={() => setEditing(null)}
        >
          <form
            key={taskKey + editReset}
            onSubmit={submitTask}
            onChange={(e) => {
              const values = Object.fromEntries(new FormData(e.currentTarget));
              try {
                localStorage.setItem(
                  taskKey,
                  JSON.stringify({
                    version:
                      taskDraft?.version ??
                      (editing === "new" ? 0 : editing!.version),
                    values,
                  }),
                );
              } catch {
                setError("草稿空间不足，请及时保存");
              }
            }}
          >
            <label>
              任务名称
              <input
                name="title"
                required
                maxLength={300}
                disabled={busy === "edit"}
                defaultValue={
                  taskDraft?.values?.title ??
                  (editing === "new" ? "" : editing.title)
                }
              />
            </label>
            <div className="geometry">
              <label>
                计划次数
                <input
                  name="target"
                  type="number"
                  min={1}
                  max={1000}
                  required
                  disabled={busy === "edit"}
                  defaultValue={
                    taskDraft?.values?.target ??
                    (editing === "new" ? 1 : editing.target)
                  }
                />
              </label>
              <label>
                任务类型
                <select
                  name="priority"
                  disabled={busy === "edit"}
                  defaultValue={
                    taskDraft?.values?.priority ??
                    (editing === "new"
                      ? tasks.some((t) => t.priority === "important")
                        ? "normal"
                        : "important"
                      : editing.priority)
                  }
                >
                  <option value="important">重要任务（每周最多一项）</option>
                  <option value="normal">中等任务</option>
                </select>
              </label>
              <label>
                排序
                <input
                  name="order"
                  type="number"
                  min={0}
                  max={10000}
                  required
                  disabled={busy === "edit"}
                  defaultValue={
                    taskDraft?.values?.order ??
                    (editing === "new" ? tasks.length : editing.order)
                  }
                />
              </label>
            </div>
            {editing !== "new" && (
              <p className="hint">
                已完成 {editing.checkins.length}{" "}
                次。缩小次数前，请先撤销多余打卡。
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="row between">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (window.confirm("清除这份本机任务草稿？")) {
                    localStorage.removeItem(taskKey);
                    setEditReset((v) => v + 1);
                  }
                }}
              >
                清除本机草稿
              </button>
              {editing !== "new" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => remove(editing).then(() => setEditing(null))}
                >
                  移除任务
                </button>
              )}
              <button className="primary" disabled={!!busy}>
                保存任务
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
