import { useState } from "react";
import type { User } from "../../shared/contracts";
import { chinaDate } from "../../shared/dates";
import { api, errorMessage, setCsrf } from "./api";
import { BoardPanel } from "./features/board/board-panel";
import { WeeklyPanel } from "./features/weekly/weekly-panel";
import { JournalPanel } from "./features/journal/journal-panel";
import { LibraryPanel } from "./features/library/library-panel";
import { AccountPanel } from "./features/auth/account-panel";
type Page = "home" | "board" | "weekly" | "journal" | "library" | "account";
const titles: Record<Page, string> = {
  home: "在自己的宇宙里",
  board: "让向往，有一个形状",
  weekly: "一步一步，靠近自己",
  journal: "给此刻一点空间",
  library: "收藏心动的片刻",
  account: "你的记录，你的选择",
};
export function Shell({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [year, month, day] = chinaDate().split("-");
  const [page, setPage] = useState<Page>(() => {
      const p = sessionStorage.getItem("flow-page:" + user.id);
      return [
        "home",
        "board",
        "weekly",
        "journal",
        "library",
        "account",
      ].includes(p || "")
        ? (p as Page)
        : "home";
    }),
    [error, setError] = useState(""),
    [leaving, setLeaving] = useState(false);
  function nav(p: Page) {
    sessionStorage.setItem("flow-page:" + user.id, p);
    setPage(p);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function logout() {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith("flow:" + user.id + ":"),
    );
    if (
      keys.length &&
      !window.confirm(
        "仍有本机草稿。退出会清除本账号的本机草稿，请先保存或下载需要保留的内容。确定退出？",
      )
    )
      return;
    setLeaving(true);
    try {
      await api("/auth/logout", "POST", {});
      keys.forEach((k) => localStorage.removeItem(k));
      sessionStorage.removeItem("flow-page:" + user.id);
      setCsrf("");
      onLogout();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLeaving(false);
    }
  }
  const button = (p: Page, icon: string, label: string) => (
    <button
      className={page === p ? "current" : ""}
      aria-current={page === p ? "page" : undefined}
      onClick={() => nav(p)}
    >
      <span className="nav-icon" aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>✳</span>
          <div>
            心流显化<small>FLOW MANIFESTATION</small>
          </div>
        </div>
        <p className="nav-label">我的宇宙</p>
        <nav aria-label="主导航">
          {button("home", "⌂", "首页总览")}
          {button("board", "▧", "我的愿望")}
          <button disabled title="第二批开发">
            <span className="nav-icon">◇</span>年度计划<small>第二批</small>
          </button>
          <button disabled title="第二批开发">
            <span className="nav-icon">◴</span>十周计划<small>第二批</small>
          </button>
          {button("weekly", "☷", "每周计划")}
          <button disabled title="第三批开发">
            <span className="nav-icon">✺</span>显化练习<small>第三批</small>
          </button>
          <button disabled title="第三批开发">
            <span className="nav-icon">♫</span>冥想跟练<small>第三批</small>
          </button>
        </nav>
        <p className="nav-label personal-label">自己的空间</p>
        <nav aria-label="个人导航">
          {button("journal", "✎", "此刻的我")}
          {button("library", "▣", "我的图片")}
          {button("account", "⚙", "账号与数据")}
        </nav>
        <div className="side-note">
          <span>慢一点，也在生长。</span>
          <p>
            你不必成为别人，
            <br />
            只需要一点点靠近自己。
          </p>
        </div>
        <div className="user-card">
          <div className="avatar">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="user-name">
            {user.displayName}
            <small>私人空间</small>
          </div>
          <button className="text-button" disabled={leaving} onClick={logout}>
            退出
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            自己的空间 <i>/</i>{" "}
            {
              {
                home: "首页总览",
                board: "我的愿望",
                weekly: "每周计划",
                journal: "此刻的我",
                library: "我的图片",
                account: "账号与数据",
              }[page]
            }
          </span>
          <span className="today">
            {`${year}年${Number(month)}月${Number(day)}日`}
            <b>本机核心试用版</b>
          </span>
        </header>
        <div className="content">
          <section className="hero">
            <div>
              <p className="eyebrow">YOUR OWN UNIVERSE</p>
              <h1>{titles[page]}</h1>
              <p>在自己的宇宙里，让向往一点点照进现实。</p>
            </div>
            <span className="hero-mark" aria-hidden="true">
              ✳
            </span>
          </section>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {page === "home" ? (
            <>
              <BoardPanel userId={user.id} />
              <div className="home-grid">
                <WeeklyPanel userId={user.id} />
                <JournalPanel userId={user.id} />
              </div>
            </>
          ) : page === "board" ? (
            <BoardPanel userId={user.id} />
          ) : page === "weekly" ? (
            <WeeklyPanel userId={user.id} />
          ) : page === "journal" ? (
            <JournalPanel userId={user.id} />
          ) : page === "library" ? (
            <section className="panel">
              <LibraryPanel />
            </section>
          ) : (
            <AccountPanel />
          )}
          <footer className="footer">
            FLOW MANIFESTATION <span>让记录有归处，让变化看得见。</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
