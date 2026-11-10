export type SaveState =
  "loading" | "saved" | "saving" | "dirty" | "failed" | "conflict";
export function SaveStatus({
  state,
  testId,
  onRetry,
}: {
  state: SaveState;
  testId?: string;
  onRetry?: () => void;
}) {
  const labels = {
    loading: "正在读取",
    saved: "已保存",
    saving: "保存中…",
    dirty: "有未保存修改",
    failed: "保存失败 · 草稿已保留",
    conflict: "版本冲突 · 草稿已保留",
  };
  return (
    <span className={"save-status " + state} data-testid={testId} role="status">
      <i />
      {labels[state]}
      {(state === "failed" || state === "dirty") && onRetry && (
        <button className="text-button" onClick={onRetry}>
          重试保存
        </button>
      )}
    </span>
  );
}
