import { useState, type FormEvent } from "react";
import { api, errorMessage, setCsrf } from "../../api";
import { ExportPanel } from "../export/export-panel";
export function AccountPanel() {
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  async function change(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const b = await api("/auth/password", "POST", {
        oldPassword: f.get("oldPassword"),
        newPassword: f.get("newPassword"),
      });
      setCsrf(b.csrfToken);
      form.reset();
      setSuccess("密码已更新，其他设备的旧会话已退出。");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings">
      <ExportPanel />
      <section className="panel">
        <h2>账号安全</h2>
        <p className="muted">
          更改密码后，其他设备需要重新登录。请始终保管好注册时的恢复码。
        </p>
        <form onSubmit={change}>
          <label>
            当前密码
            <input
              name="oldPassword"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <label>
            新密码
            <input
              name="newPassword"
              type="password"
              minLength={12}
              maxLength={128}
              required
              autoComplete="new-password"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="success">
              {success}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "正在更新…" : "更新密码"}
          </button>
        </form>
      </section>
    </div>
  );
}
