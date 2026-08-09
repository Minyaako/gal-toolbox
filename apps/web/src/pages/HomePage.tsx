import { Link } from "react-router-dom";

export function HomePage() {
  return <section className="home-page" aria-labelledby="home-title">
    <p className="home-kicker">Gal toolbox / visual association archive</p>
    <h1 id="home-title">从一段记忆，打开一整个 Gal 世界。</h1>
    <p>以作品、角色、声优和 Tag 为线索，沿着 VNDB 的关联继续探索。</p>
    <Link className="home-cta" to="/knowledge">打开知识图鉴</Link>
  </section>;
}
