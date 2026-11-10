import { useEffect, useRef, useState } from "react";
import type {
  Board,
  BoardElement,
  ImageInfo,
} from "../../../../shared/contracts";
import { api, ApiError, errorMessage } from "../../api";
import { Modal } from "../../components/modal";
import { SaveStatus, type SaveState } from "../../components/save-status";
import { LibraryPanel } from "../library/library-panel";
const empty: Board = { version: 0, height: 520, elements: [] };
function spot(elements: BoardElement[], w: number, h: number) {
  for (let y = 24; y < 12000 - h; y += 24)
    for (let x = 24; x <= 976 - w; x += 24)
      if (
        !elements.some(
          (e) =>
            x < e.x + e.width + 12 &&
            x + w + 12 > e.x &&
            y < e.y + e.height + 12 &&
            y + h + 12 > e.y,
        )
      )
        return { x, y };
  throw new Error("画布已满，请先整理一些元素");
}
export function BoardPanel({ userId }: { userId: string }) {
  const [board, setBoard] = useState<Board>(empty),
    [selected, setSelected] = useState(""),
    [state, setState] = useState<SaveState>("loading"),
    [error, setError] = useState(""),
    [adding, setAdding] = useState(false),
    [tab, setTab] = useState<"text" | "image">("text"),
    [text, setText] = useState(""),
    [removed, setRemoved] = useState<BoardElement | null>(null),
    [scale, setScale] = useState(1),
    [readAttempt, setReadAttempt] = useState(0);
  const wrap = useRef<HTMLDivElement>(null),
    data = useRef(empty),
    version = useRef(0),
    revision = useRef(0),
    saving = useRef(false),
    conflict = useRef(false),
    ready = useRef(false),
    saveRef = useRef<() => void>(() => {}),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = "flow:" + userId + ":board";
  function store() {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ ...data.current, version: version.current }),
      );
    } catch {
      setError("浏览器草稿空间不足，请尽快保存或下载草稿。");
    }
  }
  function change(next: Board) {
    if (state === "loading") return;
    data.current = next;
    setBoard(next);
    revision.current++;
    store();
    setState(conflict.current ? "conflict" : "dirty");
    if (timer.current) clearTimeout(timer.current);
    if (!conflict.current)
      timer.current = setTimeout(() => saveRef.current(), 600);
  }
  async function save() {
    if (saving.current || conflict.current) return;
    if (!ready.current) {
      setReadAttempt((v) => v + 1);
      return;
    }
    saving.current = true;
    const rev = revision.current;
    setState("saving");
    try {
      const saved = await api<Board>("/board", "PUT", {
        ...data.current,
        version: version.current,
      });
      version.current = saved.version;
      data.current = { ...data.current, version: saved.version };
      setBoard(data.current);
      if (revision.current === rev) {
        localStorage.removeItem(key);
        setState("saved");
        setError("");
      } else {
        store();
        setState("dirty");
      }
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) {
        conflict.current = true;
        setState("conflict");
      } else setState("failed");
    } finally {
      saving.current = false;
      if (revision.current !== rev && !conflict.current)
        timer.current = setTimeout(() => saveRef.current(), 600);
    }
  }
  saveRef.current = save;
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    // Local content must be restored even if the first network read fails.
    try {
      const draft = JSON.parse(localStorage.getItem(key) || "null");
      if (draft && Array.isArray(draft.elements)) {
        data.current = draft;
        version.current = draft.version;
        setBoard(draft);
      }
    } catch {}
    api<Board>("/board")
      .then((server) => {
        if (cancelled) return;
        version.current = server.version;
        let draft: Board | null = null;
        try {
          draft = JSON.parse(localStorage.getItem(key) || "null");
        } catch {}
        ready.current = true;
        if (draft && Array.isArray(draft.elements)) {
          data.current = { ...draft, version: server.version };
          setBoard(data.current);
          if (draft.version !== server.version) {
            conflict.current = true;
            setState("conflict");
          } else {
            setState("dirty");
            timer.current = setTimeout(() => saveRef.current(), 600);
          }
        } else {
          data.current = server;
          setBoard(server);
          setState("saved");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(errorMessage(e));
        setState("failed");
      });
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, readAttempt]);
  useEffect(() => {
    const observer = new ResizeObserver(() =>
      setScale((wrap.current?.clientWidth || 1000) / 1000),
    );
    if (wrap.current) observer.observe(wrap.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (["dirty", "saving", "failed", "conflict"].includes(state)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state]);
  function update(id: string, patch: Partial<BoardElement>) {
    change({
      ...data.current,
      elements: data.current.elements.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    });
  }
  function add(type: "text" | "image", image?: ImageInfo) {
    try {
      const width = type === "image" ? 220 : 240,
        height =
          type === "image"
            ? Math.max(80, Math.min(260, (220 * image!.height) / image!.width))
            : 100,
        p = spot(data.current.elements, width, height);
      const e: BoardElement = {
        id: crypto.randomUUID(),
        type,
        ...(type === "text" ? { text: text.trim() } : { imageId: image!.id }),
        ...p,
        width,
        height,
        z: Math.max(0, ...data.current.elements.map((e) => e.z)) + 1,
        lit: false,
      };
      change({
        ...data.current,
        height: Math.max(data.current.height, Math.ceil(p.y + height + 24)),
        elements: [...data.current.elements, e],
      });
      setSelected(e.id);
      setAdding(false);
      setText("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data.current, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "愿望板草稿.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function resolve(useLocal: boolean) {
    try {
      if (
        !useLocal &&
        !window.confirm("用服务器版本替换当前画布？建议先下载草稿保存。")
      )
        return;
      const server = await api<Board>("/board");
      version.current = server.version;
      conflict.current = false;
      if (useLocal) {
        store();
        await save();
      } else {
        data.current = server;
        setBoard(server);
        localStorage.removeItem(key);
        setState("saved");
        setError("");
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const item = board.elements.find((e) => e.id === selected);
  function pointer(
    e: React.PointerEvent<HTMLElement>,
    el: BoardElement,
    resize = false,
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    setSelected(el.id);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX,
      startY = e.clientY;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale,
        dy = (ev.clientY - startY) / scale;
      const patch = resize
        ? {
            width: Math.round(
              Math.max(40, Math.min(1000 - el.x, el.width + dx)),
            ),
            height: Math.round(
              Math.max(
                40,
                Math.min(data.current.height - el.y, el.height + dy),
              ),
            ),
          }
        : {
            x: Math.round(Math.max(0, Math.min(1000 - el.width, el.x + dx))),
            y: Math.round(
              Math.max(0, Math.min(data.current.height - el.height, el.y + dy)),
            ),
          };
      update(el.id, patch);
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }
  return (
    <section className="board-section">
      <div className="section-head">
        <div>
          <p className="eyebrow">MY VISION, MY UNIVERSE</p>
          <h2>我的愿望</h2>
        </div>
        <div className="row">
          <SaveStatus state={state} testId="board-save" onRetry={save} />
          <button
            className="primary"
            disabled={state === "loading"}
            onClick={() => setAdding(true)}
          >
            添加愿望
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {state === "conflict" && (
        <div className="conflict-box">
          <p>另一个页面有新修改。先保留这份草稿，再选择要使用的版本。</p>
          <div className="row">
            <button onClick={download}>下载本地草稿</button>
            <button onClick={() => resolve(false)}>读取服务器版本</button>
            <button onClick={() => resolve(true)}>保留我的版本并保存</button>
          </div>
        </div>
      )}
      <div
        ref={wrap}
        className="canvas"
        data-testid="vision-canvas"
        style={{ height: board.height * scale }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelected("");
        }}
      >
        {board.elements.length === 0 && (
          <div className="canvas-empty">
            <div className="empty-mark">✳</div>
            <h3>从一个小小的向往开始</h3>
            <p>一句话，一张图。把你期待的生活，放在看得见的地方。</p>
            <button
              disabled={state === "loading"}
              onClick={() => setAdding(true)}
            >
              ＋ 放下第一个愿望
            </button>
          </div>
        )}
        {board.elements.map((el) => (
          <div
            key={el.id}
            tabIndex={0}
            role="button"
            aria-label={
              (el.type === "text" ? el.text : "图片愿望") +
              (el.lit ? "，已点亮" : "")
            }
            className={
              "vision-element " +
              el.type +
              (el.lit ? " lit" : "") +
              (selected === el.id ? " selected" : "")
            }
            data-element-id={el.id}
            style={{
              left: el.x * scale,
              top: el.y * scale,
              width: el.width * scale,
              height: el.height * scale,
              zIndex: el.z,
              fontSize: Math.max(12, 20 * scale),
            }}
            onPointerDown={(e) => pointer(e, el)}
            onFocus={() => setSelected(el.id)}
          >
            {el.type === "image" ? (
              <img
                draggable={false}
                src={"/api/images/" + el.imageId + "/content"}
                alt="我的图片愿望"
              />
            ) : (
              <span>{el.text}</span>
            )}
            {el.lit && <b className="lit-star">✦</b>}
            {selected === el.id && (
              <button
                className="resize-handle"
                aria-label="拖动缩放"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  pointer(e, el, true);
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="board-foot">
        <span className="hint">
          {board.elements.length} 个愿望 · 选中后可拖动、缩放或编辑 ·
          点亮由你决定
        </span>
        <button
          className="text-button"
          disabled={state === "loading" || board.height >= 12000}
          onClick={() =>
            change({ ...board, height: Math.min(12000, board.height + 300) })
          }
        >
          扩展画布 ↓
        </button>
      </div>
      {removed && (
        <div className="undo-bar">
          愿望已移除
          <button
            className="text-button"
            onClick={() => {
              change({
                ...data.current,
                elements: [...data.current.elements, removed],
              });
              setRemoved(null);
            }}
          >
            撤销删除
          </button>
        </div>
      )}
      {item && (
        <div className="element-editor">
          <div className="row between">
            <h3>编辑选中的愿望</h3>
            <div className="row">
              <button onClick={() => update(item.id, { lit: !item.lit })}>
                {item.lit ? "取消点亮" : "✦ 点亮愿望"}
              </button>
              <button
                onClick={() =>
                  update(item.id, {
                    z: Math.min(
                      10000,
                      Math.max(...board.elements.map((e) => e.z)) + 1,
                    ),
                  })
                }
              >
                移到最上层
              </button>
              <button onClick={() => update(item.id, { z: 0 })}>
                移到最下层
              </button>
              <button
                onClick={() => {
                  setRemoved(item);
                  change({
                    ...data.current,
                    elements: data.current.elements.filter(
                      (e) => e.id !== item.id,
                    ),
                  });
                  setSelected("");
                }}
              >
                删除愿望
              </button>
            </div>
          </div>
          {item.type === "text" && (
            <label>
              编辑文字
              <textarea
                maxLength={1000}
                value={item.text}
                onChange={(e) => update(item.id, { text: e.target.value })}
              />
            </label>
          )}
          <div className="geometry">
            {(["x", "y", "width", "height"] as const).map((field, i) => (
              <label key={field}>
                {["横向位置", "纵向位置", "宽度", "高度"][i]}
                <input
                  type="number"
                  value={Math.round(item[field])}
                  min={i < 2 ? 0 : 20}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    const next = { ...item, [field]: v };
                    if (
                      next.x >= 0 &&
                      next.y >= 0 &&
                      next.width >= 20 &&
                      next.height >= 20 &&
                      next.x + next.width <= 1000 &&
                      next.y + next.height <= board.height
                    )
                      update(item.id, { [field]: v });
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      )}
      {adding && (
        <Modal title="放下一个新的愿望" onClose={() => setAdding(false)}>
          <div className="tabs">
            <button
              className={tab === "text" ? "active" : ""}
              onClick={() => setTab("text")}
            >
              一句话
            </button>
            <button
              className={tab === "image" ? "active" : ""}
              onClick={() => setTab("image")}
            >
              一张图片
            </button>
          </div>
          {tab === "text" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                add("text");
              }}
            >
              <label>
                愿望文字
                <textarea
                  autoFocus
                  required
                  maxLength={1000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="我向往怎样的生活？"
                />
              </label>
              <button className="primary" disabled={!text.trim()}>
                放入愿望板
              </button>
            </form>
          ) : (
            <LibraryPanel onPick={(image) => add("image", image)} />
          )}
        </Modal>
      )}
    </section>
  );
}
