import { Link } from "react-router-dom";

export function NotFoundPage() {
  return <section className="placeholder-page not-found-page" aria-labelledby="not-found-title">
    <p>404 / Cabinet not found</p><h1 id="not-found-title">这个抽屉是空的。</h1><p>地址可能已移动，或从未存在过。</p><Link to="/">回到首页</Link>
  </section>;
}
