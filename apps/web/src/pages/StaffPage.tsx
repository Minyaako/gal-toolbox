import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { getStaffCharacters } from "../api";
import { useBufferedPages } from "../buffered-pages";
import { AutoPageLoader, EntityCard, LoadingScene, NameBlock, SectionHeading, StatePanel } from "../components";
import { useTrail } from "../trail";
import { staffCharactersQuery, staffQuery } from "../queries";

export function StaffPage() {
  const { id = "" } = useParams();
  const nextPagePriority = useRef<"high" | "normal">("normal");
  const detail = useQuery({ ...staffQuery(id), enabled: Boolean(id) });
  const roles = useInfiniteQuery({
    ...staffCharactersQuery(id, () => nextPagePriority.current),
    enabled: Boolean(id),
  });
  const fetchNextPage = useCallback(async (priority: "high" | "normal") => {
    nextPagePriority.current = priority;
    try {
      return await roles.fetchNextPage();
    } finally {
      nextPagePriority.current = "normal";
    }
  }, [roles.fetchNextPage]);
  const promoteNextPage = useCallback((signal: AbortSignal) => {
    const page = (roles.data?.pages.at(-1)?.page ?? 0) + 1;
    return getStaffCharacters(id, page, 12, { signal, priority: "high" });
  }, [id, roles.data?.pages]);
  const buffered = useBufferedPages({
    scope: `staff:${id}`,
    pages: roles.data?.pages ?? [],
    hasNextPage: roles.hasNextPage,
    isFetchingNextPage: roles.isFetchingNextPage,
    fetchNextPage,
    promoteNextPage,
  });
  const { visit } = useTrail();

  useEffect(() => {
    if (detail.data) visit(detail.data.entity);
  }, [detail.data, visit]);

  if (detail.isPending) return <LoadingScene headingLevel={1} title="正在打开声优资料" note="正在整理艺名与关联角色。" />;
  if (detail.isError) return <StatePanel headingLevel={1} title="声优资料加载失败" tone="error"><p>{detail.error.message}</p><button type="button" onClick={() => detail.refetch()}>重新加载</button></StatePanel>;

  const staff = detail.data;
  const characters = buffered.items;
  return (
    <article className="detail-page entity-detail detail-staff">
      <header className="staff-hero">
        <div className="staff-glyph" aria-hidden="true">{staff.entity.name.primary.slice(0, 1)}</div>
        <div className="detail-intro">
          <div className="record-id">VNDB / {staff.entity.id}</div>
          <NameBlock entity={staff.entity} headingLevel={1} />
          {staff.aliases.length ? (
            <div className="alias-cloud" aria-label="艺名与别名">
              {staff.aliases.slice(0, 16).map((alias, index) => <span key={`${alias.name}-${index}`}>{alias.name}</span>)}
            </div>
          ) : null}
          {staff.description ? <p className="description">{staff.description}</p> : <p className="description is-muted">VNDB 暂无人物简介。</p>}
        </div>
      </header>

      <div className="detail-relations is-single">
      <section className="detail-section relation-primary">
        <SectionHeading index="01" title="配过的角色" note="图片来自角色立绘；VNDB 不提供声优本人照片。作品列表表示角色登场作品。" />
        {roles.isPending ? <LoadingScene compact title="正在整理角色卡" note="首批 12 个角色即将出现。" /> : roles.isError ? (
          <StatePanel title="角色关系加载失败" tone="error"><p>{roles.error.message}</p><button type="button" onClick={() => roles.refetch()}>重新加载</button></StatePanel>
        ) : characters.length ? (
          <>
            <div className="role-grid">
              {characters.map(({ character, appearances }) => (
                <EntityCard
                  key={character.id}
                  entity={character}
                  meta={appearances.slice(0, 2).map((item) => item.vn.name.primary).join(" · ") || "暂无作品信息"}
                />
              ))}
            </div>
            <AutoPageLoader
              hasNextPage={buffered.canRevealNextPage}
              isFetching={buffered.isWaitingForBuffer}
              buffered={buffered.hasBufferedPage}
              onLoad={() => void buffered.revealNextPage()}
              label={buffered.hasBufferedPage ? "下一页已准备好" : "继续浏览角色"}
            />
          </>
        ) : <StatePanel title="暂无配音角色记录" />}
      </section>
      </div>
    </article>
  );
}
