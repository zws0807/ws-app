import { useEffect, useRef, useState } from "react";
import type { Journal } from "../../../../shared/contracts";
import { chinaDate } from "../../../../shared/dates";
import { api, ApiError, errorMessage } from "../../api";
export function JournalPanel({ userId }: { userId: string }) {
  const key = "flow:" + userId + ":journal";
  const [text, setText] = useState(""),
    [date, setDate] = useState(chinaDate()),
    [entries, setEntries] = useState<Journal[]>([]),
    [editing, setEditing] = useState<Journal | null>(null),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  async function load(older = false) {
    try {
      const b = await api(
        "/journal" + (older && next ? "?before=" + next : ""),
      );
      setEntries((v) => (older ? [...v, ...b.entries] : b.entries));
      setNext(b.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    load();
    try {
      const draft = JSON.parse(localStorage.getItem(key) || "null");
      if (draft) {
        setText(draft.body || "");
        setDate(draft.date || chinaDate());
        setEditing(draft.editing || null);
        requestId.current = draft.requestId || crypto.randomUUID();
      }
    } catch {}
  }, [key]);
  function store(body: string, d: string, edit: Journal | null = editing) {
    setText(body);
    setDate(d);
    setSaved(false);
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          body,
          date: d,
          editing: edit,
          requestId: requestId.current,
        }),
      );
    } catch {
      setError("草稿空间不足，请及时保存。");
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(
        "/journal" + (editing ? "/" + editing.id : ""),
        editing ? "PATCH" : "POST",
        {
          date,
          body: text,
          ...(editing
            ? { version: editing.version }
            : { requestId: requestId.current }),
        },
      );
      setText("");
      setEditing(null);
      requestId.current = crypto.randomUUID();
      localStorage.removeItem(key);
      setSaved(true);
      await load();
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.code === "request_payload_changed") {
        requestId.current = crypto.randomUUID();
        store(text, date, editing);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }
  function edit(j: Journal) {
    if (
      text.trim() &&
      !window.confirm("当前有未保存内容，是否切换到这条历史记录？")
    )
      return;
    setEditing(j);
    store(j.body, j.date, j);
    setError("");
  }
  async function remove(j: Journal) {
    if (
      !window.confirm(
        "移除这条记录？系统将保留软删除状态，恢复界面在第二批提供。",
      )
    )
      return;
    try {
      await api("/journal/" + j.id, "DELETE", { version: j.version });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <section className="panel journal-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">HERE, AS I AM</p>
          <h2>此刻的我</h2>
        </div>
        <span className="journal-symbol">✎</span>
      </div>
      <p className="muted">
        不必整理好情绪，也不必写得漂亮。真实的此刻，已经值得被留下。
      </p>
      <div className="writing-space">
        <label className="journal-date">
          记录日期
          <input
            disabled={busy}
            type="date"
            value={date}
            onChange={(e) => store(text, e.target.value)}
          />
        </label>
        <label>
          此刻的感受
          <textarea
            disabled={busy}
            maxLength={50000}
            placeholder="此刻的我，正在感受……"
            value={text}
            onChange={(e) => store(e.target.value, date)}
          />
        </label>
        <div className="row between">
          <span className="hint">
            {editing
              ? "正在编辑历史 · 创建时间保持原样"
              : saved
                ? "✓ 已保存这一刻"
                : "可以补记，同一天也可以写很多次。"}
          </span>
          <button
            className="primary"
            disabled={busy || !text.trim()}
            onClick={save}
          >
            {busy ? "保存中…" : editing ? "保存修改" : "保存此刻"}
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {editing && (
        <button
          className="text-button"
          onClick={() => {
            if (text !== editing.body && !window.confirm("放弃这次编辑？"))
              return;
            setEditing(null);
            setText("");
            localStorage.removeItem(key);
          }}
        >
          取消编辑，写新的记录
        </button>
      )}
      <div className="history-head">
        <h3>留下的时刻</h3>
        <span className="hint">记录按实际创建时间排序</span>
      </div>
      {entries.length === 0 ? (
        <p className="empty-copy muted">这里会慢慢收藏你的每一个此刻。</p>
      ) : (
        entries.map((j) => (
          <article className="journal-entry" key={j.id}>
            <div className="row between">
              <span className="entry-date">
                {j.date.replaceAll("-", " / ")}
              </span>
              <div className="row">
                <button className="text-button" onClick={() => edit(j)}>
                  编辑
                </button>
                <button className="text-button" onClick={() => remove(j)}>
                  移除
                </button>
              </div>
            </div>
            <p>{j.body}</p>
          </article>
        ))
      )}
      {next && (
        <button className="text-button" onClick={() => load(true)}>
          查看更早的记录 ↓
        </button>
      )}
    </section>
  );
}
