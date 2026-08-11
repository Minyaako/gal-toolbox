import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { EntityCard, EntityImage, LoadingScene, NameBlock, SectionHeading, StatePanel } from "../components";
import { useTrail } from "../trail";
import { characterQuery } from "../queries";

const roleLabels = { main: "主人公", primary: "主要角色", side: "配角", appears: "登场" };

export function CharacterPage() {
  const { id = "" } = useParams();
  const query = useQuery({ ...characterQuery(id), enabled: Boolean(id) });
  const { visit } = useTrail();

  useEffect(() => {
    if (query.data) visit(query.data.entity);
  }, [query.data, visit]);

  if (query.isPending) return <LoadingScene headingLevel={1} title="正在打开角色资料" note="立绘和登场作品正在归档。" />;
  if (query.isError) return <StatePanel headingLevel={1} title="角色资料加载失败" tone="error"><p>{query.error.message}</p><button type="button" onClick={() => query.refetch()}>重新加载</button></StatePanel>;
  const character = query.data;

  return (
    <article className="detail-page entity-detail detail-character">
      <header className="detail-hero character-hero">
        <EntityImage image={character.entity.image} alt={character.entity.name.primary} className="detail-cover" eager />
        <div className="detail-intro">
          <div className="record-id">VNDB / {character.entity.id}</div>
          <NameBlock entity={character.entity} headingLevel={1} />
          {character.description ? <p className="description">{character.description}</p> : <p className="description is-muted">暂无角色简介。</p>}
        </div>
      </header>
      <div className="detail-relations is-single">
      <section className="detail-section relation-primary">
        <SectionHeading index="01" title="登场作品" note="选择一部作品，继续查看它的角色与配音关系。" />
        {character.appearances.length ? (
          <div className="entity-grid">
            {character.appearances.map(({ vn, role }, index) => (
              <EntityCard key={`${vn.id}-${index}`} entity={vn} meta={roleLabels[role]} />
            ))}
          </div>
        ) : <StatePanel title="暂无关联作品" />}
      </section>
      </div>
    </article>
  );
}
