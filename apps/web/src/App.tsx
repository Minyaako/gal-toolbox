import { useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { ExplorationTrail } from "./trail";
import { CharacterPage } from "./pages/CharacterPage";
import { SearchPage } from "./pages/SearchPage";
import { StaffPage } from "./pages/StaffPage";
import { VnPage } from "./pages/VnPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <div className="app-shell">
      <ScrollToTop />
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="site-header">
        <Link className="brand" to="/">
          <span className="brand-seal" aria-hidden="true">百</span>
          <span><strong>Gal 百宝箱</strong><small>Visual association archive</small></span>
        </Link>
        <nav aria-label="主导航">
          <Link to="/">联想搜索</Link>
          <a href="https://vndb.org/" target="_blank" rel="noreferrer">数据来源 VNDB ↗</a>
        </nav>
      </header>
      <main id="main-content">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/vn/:id" element={<VnPage />} />
          <Route path="/character/:id" element={<CharacterPage />} />
          <Route path="/staff/:id" element={<StaffPage />} />
          <Route path="*" element={<SearchPage />} />
        </Routes>
      </main>
      <ExplorationTrail />
      <footer className="site-footer">
        <span>Gal 百宝箱 / MVP 0.1</span>
        <span>非商业验证项目 · 数据来自 VNDB</span>
      </footer>
    </div>
  );
}
