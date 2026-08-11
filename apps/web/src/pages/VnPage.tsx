import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { useParams } from "react-router-dom";
import { EntityCard, EntityImage, EntityPrefetchLink, LoadingScene, NameBlock, SectionHeading, StatePanel } from "../components";
import { useTrail } from "../trail";
import { vnQuery } from "../queries";
import { getSecondaryName } from "../tag-label";

const relationLabels: Record<string, string> = {
  ser: "同系列",
  seq: "续作",
  preq: "前作",
  set: "同设定",
  alt: "替代版本",
  char: "共享角色",
  side: "外传",
  par: "母作品",
  orig: "原作",
  fan: "衍生作品",
};

export function RelationRail({ children }: { children: ReactNode }) {
  return <div className="relation-rail">{children}</div>;
}

export function VnPage() {
  const { id = "" } = useParams();
  const query = useQuery({ ...vnQuery(id), enabled: Boolean(id) });
  const { visit } = useTrail();

  useEffect(() => {
    if (query.data) visit(query.data.entity);
  }, [query.data, visit]);

  if (query.isPending) return <LoadingScene headingLevel={1} title="正在打开作品档案" note="封面、配音关系和 Tag 正在汇合。" />;
  if (query.isError) return <StatePanel headingLevel={1} title="作品资料加载失败" tone="error"><p>{query.error.message}</p><button type="button" onClick={() => query.refetch()}>重新加载</button></StatePanel>;

  const vn = query.data;
  const visibleTags = vn.tags
    .filter((item) => item.spoiler === 0 && item.category !== "ero")
    .slice(0, 24);
  return (
    <article className="detail-page entity-detail detail-vn">
      <header className="detail-hero">
        <EntityImage image={vn.entity.image} alt={vn.entity.name.primary} className="detail-cover" eager />
        <div className="detail-intro">
          <div className="record-id">VNDB / {vn.entity.id}</div>
          <NameBlock entity={vn.entity} headingLevel={1} />
          <dl className="fact-strip">
            <div><dt>发售</dt><dd>{vn.released ?? "未知"}</dd></div>
            <div><dt>评分</dt><dd>{vn.rating ? (vn.rating / 10).toFixed(2) : "—"}</dd></div>
            <div><dt>票数</dt><dd>{vn.voteCount.toLocaleString()}</dd></div>
          </dl>
          {vn.description ? <p className="description">{vn.description}</p> : <p className="description is-muted">暂无简介。</p>}
        </div>
      </header>

      <div className="detail-relations">
      <section className="detail-section relation-primary">
        <SectionHeading index="01" title="角色与声优" note="点击任意一侧都可以继续探索。" />
        {vn.cast.length ? (
          <div className="cast-list">
            {vn.cast.map((pair, index) => (
              <article className="cast-pair" key={`${pair.character.id}-${pair.staff.id}-${index}`}>
                <EntityPrefetchLink className="cast-person character" entity={pair.character} aria-label={`打开角色：${pair.character.name.primary}`}>
                  <EntityImage image={pair.character.image} alt="" />
                  <span><b>{pair.character.name.primary}</b><small>{pair.character.name.romanized}</small></span>
                </EntityPrefetchLink>
                <div className="voice-link"><span>配音</span><i aria-hidden="true">→</i></div>
                <EntityPrefetchLink className="cast-person staff" entity={pair.staff} aria-label={`打开声优：${pair.staff.name.primary}`}>
                  <span className="staff-monogram">{pair.staff.name.primary.slice(0, 1)}</span>
                  <span><b>{pair.staff.name.primary}</b><small>{pair.staff.name.romanized}</small></span>
                </EntityPrefetchLink>
              </article>
            ))}
          </div>
        ) : <StatePanel title="该作品暂无配音关系" />}
      </section>

      {visibleTags.length || vn.relations.length ? <RelationRail>
      {visibleTags.length ? (
        <section className="detail-section tag-section relation-rail-card">
          <SectionHeading index="02" title="继续沿 Tag 探索" note="中文来自 VNDB Profile Search，英文保留用于定位。" />
          <div className="tag-cloud">
            {visibleTags.map((item) => {
                const secondary = getSecondaryName(item.tag.name);
                return (
                  <EntityPrefetchLink
                    key={item.tag.id}
                    entity={item.tag}
                    aria-label={secondary ? `${item.tag.name.primary}，${secondary}` : item.tag.name.primary}
                  >
                    <span className="tag-mark">#</span>
                    <span className="tag-name">
                      <b>{item.tag.name.primary}</b>
                      {secondary ? <em lang="en">{secondary}</em> : null}
                    </span>
                    <small>{item.rating.toFixed(1)}</small>
                  </EntityPrefetchLink>
                );
              })}
          </div>
        </section>
      ) : null}

      {vn.relations.length ? (
        <section className="detail-section relation-rail-card">
          <SectionHeading index="03" title="关联作品" note="续作、前作、同系列和其他直接关系。" />
          <div className="entity-grid compact-grid">
            {vn.relations.map(({ entity, relation }) => <EntityCard key={entity.id} entity={entity} meta={relationLabels[relation] ?? relation} />)}
          </div>
        </section>
      ) : null}
      </RelationRail> : null}
      </div>
    </article>
  );
}
