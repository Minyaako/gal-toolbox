import { NavLink, Outlet } from "react-router-dom";
import { ExplorationTrail } from "../trail";
import { mainNavigation, type NavigationItem } from "./navigation";

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

export function AppShell() {
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
      <main id="main-content"><Outlet /></main>
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
