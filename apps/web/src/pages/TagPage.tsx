import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { getTagVns } from "../api";
import { useBufferedPages } from "../buffered-pages";
import { AutoPageLoader, EntityCard, LoadingScene, NameBlock, SectionHeading, StatePanel } from "../components";
import { useTrail } from "../trail";
import { tagQuery, tagVnsQuery } from "../queries";

const categoryLabels = {
  cont: "内容 Tag",
  ero: "成人内容 Tag",
  tech: "技术 Tag",
};

export function TagPage() {
  const { id = "" } = useParams();
  const nextPagePriority = useRef<"high" | "normal">("normal");
  const detail = useQuery({ ...tagQuery(id), enabled: Boolean(id) });
  const novels = useInfiniteQuery({
    ...tagVnsQuery(id, () => nextPagePriority.current),
    enabled: Boolean(id),
  });
  const fetchNextPage = useCallback(async (priority: "high" | "normal") => {
    nextPagePriority.current = priority;
    try {
      return await novels.fetchNextPage();
    } finally {
      nextPagePriority.current = "normal";
    }
  }, [novels.fetchNextPage]);
  const promoteNextPage = useCallback((signal: AbortSignal) => {
    const page = (novels.data?.pages.at(-1)?.page ?? 0) + 1;
    return getTagVns(id, page, 12, { signal, priority: "high" });
  }, [id, novels.data?.pages]);
  const buffered = useBufferedPages({
    scope: `tag:${id}`,
    pages: novels.data?.pages ?? [],
    hasNextPage: novels.hasNextPage,
    isFetchingNextPage: novels.isFetchingNextPage,
    fetchNextPage,
    promoteNextPage,
  });
  const { visit } = useTrail();

  useEffect(() => {
    if (detail.data) visit(detail.data.entity);
  }, [detail.data, visit]);

  if (detail.isPending) return <LoadingScene headingLevel={1} title="正在打开 Tag 索引" note="定义与关联作品正在整理。" />;
  if (detail.isError) return <StatePanel headingLevel={1} title="Tag 资料加载失败" tone="error"><p>{detail.error.message}</p><button type="button" onClick={() => detail.refetch()}>重新加载</button></StatePanel>;

  const tag = detail.data;
  const items = buffered.items;
  return (
    <article className="detail-page tag-page entity-detail detail-tag">
      <header className="staff-hero tag-hero">
        <div className="staff-glyph tag-glyph" aria-hidden="true">#</div>
        <div className="detail-intro">
          <div className="record-id">VNDB / {tag.entity.id}</div>
          <NameBlock entity={tag.entity} headingLevel={1} />
          <dl className="fact-strip">
            <div><dt>类型</dt><dd>{tag.category ? categoryLabels[tag.category] : "Tag"}</dd></div>
            <div><dt>作品数</dt><dd>{tag.vnCount.toLocaleString()}</dd></div>
          </dl>
          {tag.description ? <p className="description">{tag.description}</p> : <p className="description is-muted">暂无 Tag 说明。</p>}
        </div>
      </header>

      <div className="detail-relations is-single">
      <section className="detail-section relation-primary">
        <SectionHeading index="01" title="带有此 Tag 的作品" note="中文来自 VNDB Profile Search；按 VNDB 评分优先，后台始终多准备一页。" />
        {novels.isPending ? <LoadingScene compact title="正在整理作品卡" /> : novels.isError ? (
          <StatePanel title="关联作品加载失败" tone="error"><p>{novels.error.message}</p><button type="button" onClick={() => novels.refetch()}>重新加载</button></StatePanel>
        ) : items.length ? (
          <>
            <div className="entity-grid">{items.map((vn) => <EntityCard key={vn.id} entity={vn} />)}</div>
            <AutoPageLoader
              hasNextPage={buffered.canRevealNextPage}
              isFetching={buffered.isWaitingForBuffer}
              buffered={buffered.hasBufferedPage}
              pageProgress={buffered.visiblePageCount}
              onLoad={() => void buffered.revealNextPage()}
              label={buffered.hasBufferedPage ? "下一页已准备好" : "继续浏览相关作品"}
            />
          </>
        ) : <StatePanel title="暂无相关作品" />}
      </section>
      </div>
    </article>
  );
}

