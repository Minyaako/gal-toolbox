import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { getStaff, getStaffCharacters } from "../api";
import { EntityCard, LoadingGrid, NameBlock, SectionHeading, StatePanel } from "../components";
import { useTrail } from "../trail";

export function StaffPage() {
  const { id = "" } = useParams();
  const detail = useQuery({ queryKey: ["staff", id], queryFn: () => getStaff(id), enabled: Boolean(id) });
  const roles = useInfiniteQuery({
    queryKey: ["staff-characters", id],
    queryFn: ({ pageParam }) => getStaffCharacters(id, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.more ? lastPage.page + 1 : undefined),
    enabled: Boolean(id),
  });
  const { visit } = useTrail();

  useEffect(() => {
    if (detail.data) visit(detail.data.entity);
  }, [detail.data, visit]);

  if (detail.isPending) return <LoadingGrid />;
  if (detail.isError) return <StatePanel title="声优资料加载失败" tone="error"><p>{detail.error.message}</p></StatePanel>;

  const staff = detail.data;
  const characters = roles.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <article className="detail-page">
      <header className="staff-hero">
        <div className="staff-glyph" aria-hidden="true">{staff.entity.name.primary.slice(0, 1)}</div>
        <div className="detail-intro">
          <div className="record-id">VNDB / {staff.entity.id}</div>
          <NameBlock entity={staff.entity} />
          {staff.aliases.length ? (
            <div className="alias-cloud" aria-label="艺名与别名">
              {staff.aliases.slice(0, 16).map((alias, index) => <span key={`${alias.name}-${index}`}>{alias.name}</span>)}
            </div>
          ) : null}
          {staff.description ? <p className="description">{staff.description}</p> : <p className="description is-muted">VNDB 暂无人物简介。</p>}
        </div>
      </header>

      <section className="detail-section">
        <SectionHeading index="01" title="配过的角色" note="图片来自角色立绘；VNDB 不提供声优本人照片。作品列表表示角色登场作品。" />
        {roles.isPending ? <LoadingGrid /> : roles.isError ? (
          <StatePanel title="角色关系加载失败" tone="error"><p>{roles.error.message}</p></StatePanel>
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
            {roles.hasNextPage ? (
              <button className="load-more" type="button" disabled={roles.isFetchingNextPage} onClick={() => roles.fetchNextPage()}>
                {roles.isFetchingNextPage ? "正在取下一页…" : "加载更多角色"}
              </button>
            ) : null}
          </>
        ) : <StatePanel title="暂无配音角色记录" />}
      </section>
    </article>
  );
}

