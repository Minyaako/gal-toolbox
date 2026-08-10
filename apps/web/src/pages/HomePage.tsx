import { Link } from "react-router-dom";
import { entityPath } from "../api";
import { useSettings } from "../app/settings";
import { useTrail } from "../trail";

const preferenceLabels = {
  motion: { full: "完整色幕", reduced: "简化淡入", off: "已关闭" },
  prefetch: { "data-saver": "节省流量", balanced: "平衡", aggressive: "积极" },
} as const;

function LobbyArtwork({ src, kind }: { src: string; kind: "knowledge" | "ranking" | "settings" }) {
  return <span className={`lobby-artwork lobby-artwork-${kind}`} aria-hidden="true">
    <svg viewBox="0 0 120 120" focusable="false">
      <path d="M23 25h31c8 0 13 4 16 10 3-6 8-10 16-10h11v66H84c-7 0-12 2-14 6-2-4-7-6-14-6H23z" />
      <path d="M70 35v62M34 42h22M34 53h22M84 42h7M84 53h7" />
    </svg>
    <img src={src} alt="" />
  </span>;
}

export function HomePage() {
  const { settings, motion } = useSettings();
  const { items } = useTrail();
  const latest = items.at(-1);

  return <section className="lobby-page" aria-labelledby="home-title">
    <header className="lobby-heading">
      <div>
        <p className="eyebrow">Tool hall / 001</p>
        <h1 id="home-title">百宝箱功能大厅</h1>
      </div>
      <p>挑一条线索直接出发。作品、角色、声优与 Tag 会在探索中彼此连起来。</p>
    </header>

    <div className="lobby-grid">
      <article className="lobby-card lobby-knowledge">
        <LobbyArtwork src="/decorations/lobby-knowledge.webp" kind="knowledge" />
        <div className="lobby-card-copy">
          <p className="card-index">01 / Association archive</p>
          <h2>Gal 联想图鉴</h2>
          <p>从记得的名字、原文或 VNDB ID 开始，顺着角色与配音关系继续探索。</p>
          <div className="knowledge-route-map" aria-hidden="true">
            <span>作品</span><i /><span>角色</span><i /><span>声优</span><i /><span>Tag</span>
          </div>
          <Link className="primary-action" to="/knowledge">进入图鉴 <span aria-hidden="true">↗</span></Link>
        </div>
      </article>

      <article className="lobby-card lobby-ranking">
        <LobbyArtwork src="/decorations/lobby-ranking.webp" kind="ranking" />
        <div className="lobby-card-copy">
          <p className="card-index">02 / In preparation</p>
          <h2>Gal 排行</h2>
          <p>评分、收藏与趋势榜单的框架正在整理。</p>
          <div className="rank-preview" aria-hidden="true"><b>01</b><span /><b>02</b><span /><b>03</b><span /></div>
          <Link className="text-action" to="/ranking">查看筹备页 →</Link>
        </div>
      </article>

      <article className="lobby-card lobby-settings">
        <LobbyArtwork src="/decorations/lobby-settings.webp" kind="settings" />
        <div className="lobby-card-copy">
          <p className="card-index">03 / Local controls</p>
          <h2>设置</h2>
          <dl className="lobby-settings-summary">
            <div><dt>转场</dt><dd>{preferenceLabels.motion[motion]}</dd></div>
            <div><dt>预加载</dt><dd>{preferenceLabels.prefetch[settings.prefetch]}</dd></div>
          </dl>
          <Link className="text-action" to="/settings">调整阅读体验 →</Link>
        </div>
      </article>

      <aside className="lobby-recent" aria-labelledby="recent-title">
        <p className="card-index">Recent trace</p>
        <h2 id="recent-title">最近探索</h2>
        {latest ? <>
          <p>上次停在 <strong>{latest.name.primary}</strong>，探索轨迹中共有 {items.length} 个节点。</p>
          <Link to={entityPath(latest)}>继续这条关系链 →</Link>
        </> : <p>还没有轨迹。打开图鉴后，走过的关系会留在这里。</p>}
      </aside>

      <section className="lobby-more" aria-label="更多功能预留">
        <span aria-hidden="true">＋</span>
        <div><h2>更多功能</h2><p>一个安静的空位，留给下一件真正有用的工具。</p></div>
      </section>
    </div>
  </section>;
}
