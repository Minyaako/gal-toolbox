import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { getTag, getTagVns } from "../api";
import { AutoPageLoader, EntityCard, LoadingScene, NameBlock, SectionHeading, StatePanel } from "../components";
import { useTrail } from "../trail";

const categoryLabels = {
  cont: "内容 Tag",
  ero: "成人内容 Tag",
  tech: "技术 Tag",
};

export function TagPage() {
  const { id = "" } = useParams();
  const detail = useQuery({ queryKey: ["tag", id], queryFn: () => getTag(id), enabled: Boolean(id) });
  const novels = useInfiniteQuery({
    queryKey: ["tag-vns", id],
    queryFn: ({ pageParam }) => getTagVns(id, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.more ? lastPage.page + 1 : undefined),
    enabled: Boolean(id),
  });
  const { visit } = useTrail();

  useEffect(() => {
    if (detail.data) visit(detail.data.entity);
  }, [detail.data, visit]);

  if (detail.isPending) return <LoadingScene title="正在打开 Tag 索引" note="定义与关联作品正在整理。" />;
  if (detail.isError) return <StatePanel title="Tag 资料加载失败" tone="error"><p>{detail.error.message}</p></StatePanel>;

  const tag = detail.data;
  const items = novels.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <article className="detail-page tag-page">
      <header className="staff-hero tag-hero">
        <div className="staff-glyph tag-glyph" aria-hidden="true">#</div>
        <div className="detail-intro">
          <div className="record-id">VNDB / {tag.entity.id}</div>
          <NameBlock entity={tag.entity} />
          <dl className="fact-strip">
            <div><dt>类型</dt><dd>{tag.category ? categoryLabels[tag.category] : "Tag"}</dd></div>
            <div><dt>作品数</dt><dd>{tag.vnCount.toLocaleString()}</dd></div>
          </dl>
          {tag.description ? <p className="description">{tag.description}</p> : <p className="description is-muted">暂无 Tag 说明。</p>}
        </div>
      </header>

      <section className="detail-section">
        <SectionHeading index="01" title="带有此 Tag 的作品" note="按 VNDB 评分优先，接近页尾时自动准备下一批。" />
        {novels.isPending ? <LoadingScene compact title="正在整理作品卡" /> : novels.isError ? (
          <StatePanel title="关联作品加载失败" tone="error"><p>{novels.error.message}</p></StatePanel>
        ) : items.length ? (
          <>
            <div className="entity-grid">{items.map((vn) => <EntityCard key={vn.id} entity={vn} />)}</div>
            <AutoPageLoader
              hasNextPage={novels.hasNextPage}
              isFetching={novels.isFetchingNextPage}
              onLoad={() => void novels.fetchNextPage()}
              label="继续浏览相关作品"
            />
          </>
        ) : <StatePanel title="暂无相关作品" />}
      </section>
    </article>
  );
}

