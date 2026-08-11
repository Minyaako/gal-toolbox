import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { getArtistVns } from "../api";
import { artistPath } from "../app/navigation";
import { useBufferedPages } from "../buffered-pages";
import { ArtistCredits, AutoPageLoader, EntityCard, LoadingScene, NameBlock, SectionHeading, StatePanel } from "../components";
import { artistQuery, artistVnsQuery } from "../queries";
import { useTrail } from "../trail";

export function ArtistPage() {
  const { id = "" } = useParams();
  const nextPagePriority = useRef<"high" | "normal">("normal");
  const detail = useQuery({ ...artistQuery(id), enabled: Boolean(id) });
  const works = useInfiniteQuery({ ...artistVnsQuery(id, () => nextPagePriority.current), enabled: Boolean(id) });
  const fetchNextPage = useCallback(async (priority: "high" | "normal") => {
    nextPagePriority.current = priority;
    try { return await works.fetchNextPage(); } finally { nextPagePriority.current = "normal"; }
  }, [works.fetchNextPage]);
  const promoteNextPage = useCallback((signal: AbortSignal) => {
    const page = (works.data?.pages.at(-1)?.page ?? 0) + 1;
    return getArtistVns(id, page, 12, { signal, priority: "high" });
  }, [id, works.data?.pages]);
  const buffered = useBufferedPages({
    scope: `artist:${id}`, pages: works.data?.pages ?? [], hasNextPage: works.hasNextPage,
    isFetchingNextPage: works.isFetchingNextPage, fetchNextPage, promoteNextPage,
  });
  const { visit } = useTrail();
  useEffect(() => { if (detail.data) visit(detail.data.entity, artistPath(detail.data.entity.id)); }, [detail.data, visit]);

  if (detail.isPending) return <LoadingScene headingLevel={1} title="正在打开画师资料" />;
  if (detail.isError) return <StatePanel headingLevel={1} title="画师资料加载失败" tone="error"><p>{detail.error.message}</p><button type="button" onClick={() => detail.refetch()}>重新加载</button></StatePanel>;
  const artist = detail.data;
  return <article className="detail-page entity-detail detail-artist">
    <header className="staff-hero"><div className="staff-glyph" aria-hidden="true">{artist.entity.name.primary.slice(0, 1)}</div><div className="detail-intro">
      <div className="record-id">VNDB / {artist.entity.id}</div><NameBlock entity={artist.entity} headingLevel={1} kindLabel="画师" />
      {artist.aliases.length ? <div className="alias-cloud">{artist.aliases.map((alias, index) => <span key={`${alias.name}-${index}`}>{alias.name}</span>)}</div> : null}
      {artist.description ? <p className="description">{artist.description}</p> : <p className="description is-muted">VNDB 暂无画师简介。</p>}
    </div></header>
    <div className="detail-relations is-single"><section className="detail-section relation-primary">
      <SectionHeading index="01" title="参与作品" />
      {works.isPending ? <LoadingScene compact /> : works.isError ? <StatePanel title="作品关系加载失败" tone="error"><p>{works.error.message}</p><button type="button" onClick={() => works.refetch()}>重新加载</button></StatePanel> : buffered.items.length ? <>
        <div className="artist-work-grid">{buffered.items.map(({ vn, credits }) => <EntityCard key={vn.id} entity={vn} meta={<ArtistCredits credits={credits} />} />)}</div>
        <AutoPageLoader pageScope={`artist:${id}`} pageProgress={buffered.visiblePageCount} hasNextPage={buffered.canRevealNextPage} isFetching={buffered.isWaitingForBuffer} buffered={buffered.hasBufferedPage} onLoad={() => void buffered.revealNextPage()} label={buffered.hasBufferedPage ? "下一页已准备好" : "继续浏览作品"} />
      </> : <StatePanel title="暂无画师作品记录" />}
    </section></div>
  </article>;
}
