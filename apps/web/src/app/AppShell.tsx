import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { NavLink, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { ExplorationTrail } from "../trail";
import { queryCacheSummary } from "../queries";
import { mainNavigation, type NavigationItem } from "./navigation";
import { pageTitle } from "./routes";
import { RouteTransition } from "./RouteTransition";
import { SettingsProvider } from "./settings";

function NavigationMetadata({ item }: { item: NavigationItem }) {
  return <>
    <span className="app-navigation-marker" aria-hidden="true">{item.marker}</span>
    <span className="app-navigation-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
  </>;
}

function NavigationLinks({ placement }: { placement: "rail" | "bottom" }) {
  return <nav className={`app-navigation app-navigation-${placement}`} aria-label="主导航">
    {mainNavigation.map((item) => (
      <NavLink
        key={item.section}
        to={item.to}
        end={item.section === "home"}
        className={({ isActive }) => `app-navigation-link ${isActive ? "is-active" : ""}`}
      >
        <NavigationMetadata item={item} />
      </NavLink>
    ))}
  </nav>;
}

function StatusBar() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const cacheSnapshot = useSyncExternalStore(
    (notify) => queryClient.getQueryCache().subscribe(notify),
    () => {
      const summary = queryCacheSummary(queryClient);
      return `${summary.total}:${summary.fetching}`;
    },
    () => {
      const summary = queryCacheSummary(queryClient);
      return `${summary.total}:${summary.fetching}`;
    },
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const [total, fetching] = cacheSnapshot.split(":").map(Number);
  const cache = { total, fetching };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = String(data.get("q") ?? "").trim();
    if (query) navigate(`/knowledge?type=vn&q=${encodeURIComponent(query)}`);
  };

  return <header className="app-status-bar">
    <strong className="app-status-module" aria-label="当前模块">{pageTitle(location.pathname)}</strong>
    <form className="app-global-search" role="search" action="/knowledge" method="get" onSubmit={submit}>
      <input type="hidden" name="type" value="vn" />
      <label className="visually-hidden" htmlFor="global-search">全局搜索作品</label>
      <input id="global-search" name="q" type="search" placeholder="全局搜索 Gal…" autoComplete="off" />
      <button type="submit" aria-label="搜索">⌕</button>
    </form>
    <span className={`app-status-health ${online ? "is-online" : "is-offline"}`} aria-label="网络与缓存状态" role="status">
      {online ? "在线" : "离线"} · 缓存 {cache.total}{cache.fetching ? ` · ${cache.fetching} 加载中` : ""}
    </span>
    <NavLink className="app-status-settings" to="/settings" aria-label="快速设置">⚙<span>设置</span></NavLink>
  </header>;
}

function ShellLayout() {
  const outlet = useOutlet();
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <aside className="app-rail">
      <NavLink className="brand" to="/" end aria-label="Gal 百宝箱首页">
        <span className="brand-seal" aria-hidden="true">百</span>
        <span><strong>Gal 百宝箱</strong><small>Visual association archive</small></span>
      </NavLink>
      <NavigationLinks placement="rail" />
      <div className="app-rail-links">
        <a href="/api/docs" target="_blank" rel="noreferrer">API 文档 ↗</a>
        <a href="https://vndb.org/" target="_blank" rel="noreferrer">数据来源 VNDB ↗</a>
      </div>
    </aside>
    <div className="app-stage">
      <StatusBar />
      <main id="main-content"><RouteTransition>{outlet}</RouteTransition></main>
      <ExplorationTrail />
      <footer className="site-footer">
        <span>Gal 百宝箱 / MVP 0.1</span>
        <span>非商业验证项目 · 数据来自 VNDB</span>
        <a href="https://github.com/JodieRuth/VNDB-Profile-Search" target="_blank" rel="noreferrer">Tag 中文：VNDB Profile Search ↗</a>
      </footer>
    </div>
    <NavigationLinks placement="bottom" />
  </div>;
}

export function AppShell() {
  return <SettingsProvider><ShellLayout /></SettingsProvider>;
}
