import { useEffect, useState } from "react";
import type { User } from "../../shared/contracts";
import { api, setCsrf } from "./api";
import { AuthPanel } from "./features/auth/auth-panel";
import { Shell } from "./shell";
import { Modal } from "./components/modal";
export function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [code, setCode] = useState("");
  useEffect(() => {
    api("/auth/me")
      .then((b) => {
        setUser(b.user);
        setCsrf(b.csrfToken);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      {loading ? (
        <div className="loading">正在打开你的空间…</div>
      ) : user ? (
        <Shell user={user} onLogout={() => setUser(null)} />
      ) : (
        <AuthPanel onLogin={setUser} onRecovery={setCode} />
      )}{" "}
      {code && (
        <Modal title="请保存你的恢复码" onClose={() => setCode("")}>
          <p>
            这是找回账号的凭据，仅在这里展示一次。请保存到安全的地方，勿发给他人。
          </p>
          <code className="recovery-code">{code}</code>
          <p className="hint">系统不会保存可直接使用的明文恢复码。</p>
          <button className="primary" onClick={() => setCode("")}>
            我已妥善保存
          </button>
        </Modal>
      )}
    </>
  );
}
