export function RankingPage() {
  return <section className="ranking-page" aria-labelledby="ranking-title">
    <header className="page-heading ranking-heading">
      <p className="eyebrow">Ranking cabinet / 003</p>
      <h1 id="ranking-title">Gal 排行</h1>
      <p>奖章已经挂好，数据规则仍在校准。首版不展示虚构名次。</p>
    </header>

    <div className="ranking-frame">
      <span className="ranking-medal" aria-hidden="true">★</span>
      <div className="ranking-status" role="status">
        <small>Archive status / preparing</small>
        <h2>正在整理榜单</h2>
        <p>评分、收藏与时间范围会在数据来源确认后开放。</p>
      </div>
      <fieldset className="ranking-filters" disabled aria-label="未来榜单筛选器">
        <legend>筛选器预览</legend>
        <button type="button">综合评分</button>
        <button type="button">收藏趋势</button>
        <button type="button">全年作品</button>
      </fieldset>
      <ol className="ranking-outline" aria-label="未来榜单列表轮廓">
        {[1, 2, 3, 4].map((rank) => <li key={rank}>
          <b>{String(rank).padStart(2, "0")}</b><span /><i />
        </li>)}
      </ol>
    </div>
  </section>;
}
