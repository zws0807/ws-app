import { useEffect, useState, useRef } from "react";
import { api, ApiError, errorMessage } from "../../api";
import type { ImageInfo } from "../../../../shared/contracts";
export function LibraryPanel({
  onPick,
}: {
  onPick?: (image: ImageInfo) => void;
}) {
  const [images, setImages] = useState<ImageInfo[]>([]),
    [used, setUsed] = useState(0),
    [next, setNext] = useState<string | null>(null),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const input = useRef<HTMLInputElement>(null);
  async function load(older = false) {
    const b = await api("/images" + (older && next ? "?before=" + next : ""));
    setImages((v) => (older ? [...v, ...b.images] : b.images));
    setNext(b.nextCursor);
    setUsed(b.usage.used);
  }
  useEffect(() => {
    load().catch((e) => setError(errorMessage(e)));
  }, []);
  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const f = new FormData();
      f.set("file", file);
      await api("/images", "POST", f, { "x-request-id": key.current });
      key.current = crypto.randomUUID();
      setFile(null);
      if (input.current) input.current.value = "";
      await load();
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.code !== "upload_pending")
        key.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }
  async function remove(img: ImageInfo) {
    if (
      !window.confirm("从私人图片库移除此图片？仍被愿望板使用的图片不会删除。")
    )
      return;
    try {
      await api("/images/" + img.id, "DELETE", {});
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <section>
      <div className="section-head">
        <div>
          <h2>我的图片</h2>
          <p className="muted">只属于你的素材空间</p>
        </div>
        <span className="badge">{(used / 1048576).toFixed(1)} / 200 MB</span>
      </div>
      <div className="upload-box">
        <label>
          上传图片
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              key.current = crypto.randomUUID();
              setError("");
            }}
          />
        </label>
        <p className="hint">
          JPEG / PNG / WebP · 单图10MB以内 · 最多2400万像素
        </p>
        {file && (
          <button className="primary" disabled={busy} onClick={upload}>
            {busy ? "正在上传…" : error ? "重试上传" : "上传到我的图片"}
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {images.length === 0 ? (
        <div className="empty-state">
          <span>▧</span>
          <h3>为向往留下一张图</h3>
          <p>上传你喜欢的照片，再把它放进愿望板。</p>
        </div>
      ) : (
        <div className="image-grid">
          {images.map((img) => (
            <article key={img.id} className="image-tile">
              <button
                className="image-preview"
                disabled={!onPick}
                onClick={() => onPick?.(img)}
                aria-label={"选用图片" + img.id}
              >
                <img
                  src={"/api/images/" + img.id + "/thumbnail"}
                  alt="私人素材"
                  loading="lazy"
                />
              </button>
              <div className="row between">
                <span className="hint">
                  {img.width} × {img.height}
                </span>
                {onPick ? (
                  <button className="small" onClick={() => onPick(img)}>
                    放入愿望板
                  </button>
                ) : (
                  <button className="text-button" onClick={() => remove(img)}>
                    移除
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {next && (
        <button
          className="text-button"
          onClick={() => load(true).catch((e) => setError(errorMessage(e)))}
        >
          查看更多图片
        </button>
      )}
      <p className="hint">
        会员图库将在第三批开放；当前图片均来自你自己的上传。
      </p>
    </section>
  );
}
