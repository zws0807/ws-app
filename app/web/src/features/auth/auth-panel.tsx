import { useEffect, useState, type FormEvent } from "react";
import { Turnstile } from "../../components/turnstile";
import { api, errorMessage, setCsrf } from "../../api";
import type { User } from "../../../../shared/contracts";
export function AuthPanel({
  onLogin,
  onRecovery,
}: {
  onLogin: (user: User) => void;
  onRecovery: (code: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "recover">("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [verification, setVerification] = useState<{
      verificationRequired: boolean;
      turnstileSiteKey: string;
    } | null>(null),
    [token, setToken] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    api("/config")
      .then(setVerification)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const b = await api("/auth/" + mode, "POST", {
        username: f.get("username"),
        password: f.get("password"),
        ...(mode === "recover"
          ? {
              recoveryCode: f.get("recoveryCode"),
              newPassword: f.get("password"),
            }
          : {}),
        turnstileToken: verification?.verificationRequired
          ? token
          : "local-development-token",
      });
      if (mode === "recover") {
        onRecovery(b.recoveryCode);
        setMode("login");
      } else {
        setCsrf(b.csrfToken);
        onLogin(b.user);
        if (b.recoveryCode) onRecovery(b.recoveryCode);
      }
    } catch (e) {
      setError(errorMessage(e));
      setToken("");
      setAttempt((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="brand-symbol">✳</div>
        <p className="eyebrow">FLOW · YOUR OWN UNIVERSE</p>
        <h1>
          心流显化
          <span>
            让向往，
            <br />
            一点点照进现实。
          </span>
        </h1>
        <p>
          放下一个愿望，靠近一个行动。
          <br />
          在自己的节奏里，看见正在发生的变化。
        </p>
        <div className="auth-orbit" aria-hidden="true">
          <span>愿望</span>
          <span>行动</span>
          <span>感受</span>
        </div>
        <small>你的记录，属于你自己的空间。</small>
      </section>
      <section className="auth-card">
        <p className="eyebrow">A SPACE TO BECOME</p>
        <h2>
          {mode === "register"
            ? "开启自己的宇宙"
            : mode === "recover"
              ? "找回自己的空间"
              : "欢迎回到这里"}
        </h2>
        <p className="muted">
          {mode === "recover"
            ? "使用你保存的恢复码，设置一个新密码。"
            : "把向往留在这里，让每一步都有归处。"}
        </p>
        <form onSubmit={submit}>
          <label>
            用户名
            <input
              name="username"
              required
              minLength={3}
              maxLength={32}
              autoComplete="username"
            />
          </label>
          {mode === "recover" && (
            <label>
              恢复码
              <input name="recoveryCode" required autoComplete="off" />
            </label>
          )}
          <label>
            {mode === "recover" ? "新密码" : "密码"}
            <input
              name="password"
              type="password"
              required
              minLength={mode === "login" ? 1 : 12}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </label>
          {mode !== "login" && (
            <p className="hint">
              密码至少 12
              个字符。请妥善保存恢复码，遗失密码和恢复码后无法仅凭用户名找回。
            </p>
          )}
          {verification?.verificationRequired && mode !== "login" && (
            <Turnstile
              key={mode + attempt}
              siteKey={verification.turnstileSiteKey}
              action={mode}
              onToken={setToken}
            />
          )}{" "}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button
            className="primary wide"
            disabled={
              busy ||
              !verification ||
              (verification.verificationRequired && mode !== "login" && !token)
            }
          >
            {busy
              ? "正在处理…"
              : mode === "register"
                ? "创建账号"
                : mode === "recover"
                  ? "重置密码"
                  : "登录自己的空间"}
          </button>
        </form>
        <div className="auth-links">
          <button
            className="text-button"
            onClick={() => {
              setError("");
              setMode(mode === "register" ? "login" : "register");
            }}
          >
            {mode === "register" ? "已有账号，去登录" : "注册新账号"}
          </button>
          <button
            className="text-button"
            onClick={() => {
              setError("");
              setMode(mode === "recover" ? "login" : "recover");
            }}
          >
            {mode === "recover" ? "返回登录" : "忘记密码"}
          </button>
        </div>
        <p className="local-note">本机核心试用版 · 云资源待配置</p>
      </section>
    </div>
  );
}
