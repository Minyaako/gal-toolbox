import { useInfiniteQuery } from "@tanstack/react-query";
import { type FormEvent, useCallback, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getSearchPage, type EntityType } from "../api";
import { useBufferedPages } from "../buffered-pages";
import { AutoPageLoader, EntityCard, LoadingScene, SectionHeading, StatePanel } from "../components";
import { searchQuery } from "../queries";

const tabs: Array<{ value: EntityType; label: string; hint: string }> = [
  { value: "vn", label: "作品", hint: "标题、别名或 VNDB ID" },
  { value: "character", label: "角色", hint: "角色原名、罗马字或 ID" },
  { value: "staff", label: "声优", hint: "本名、艺名或 staff ID" },
  { value: "tag", label: "Tag", hint: "中文或英文题材、内容与技术标签" },
];

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const type = (params.get("type") as EntityType | null) ?? "vn";
  const query = params.get("q") ?? "";
  const [draft, setDraft] = useState(query);
  const nextPagePriority = useRef<"high" | "normal">("high");

  const search = useInfiniteQuery({
    ...searchQuery(type, query, () => nextPagePriority.current),
    enabled: Boolean(query),
  });
  const fetchNextPage = useCallback(async (priority: "high" | "normal") => {
    nextPagePriority.current = priority;
    try {
      return await search.fetchNextPage();
    } finally {
      nextPagePriority.current = "normal";
    }
  }, [search.fetchNextPage]);
  const promoteNextPage = useCallback((signal: AbortSignal) => {
    const page = (search.data?.pages.at(-1)?.page ?? 0) + 1;
    return getSearchPage(type, query, page, 12, { signal, priority: "high" });
  }, [query, search.data?.pages, type]);
  const buffered = useBufferedPages({
    scope: `search:${type}:${query}`,
    pages: search.data?.pages ?? [],
    hasNextPage: search.hasNextPage,
    isFetchingNextPage: search.isFetchingNextPage,
    fetchNextPage,
    promoteNextPage,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim();
    if (next) setParams({ type, q: next });
  }

  function changeType(next: EntityType) {
    setParams(query ? { type: next, q: query } : { type: next });
  }

  const items = buffered.items;

  return (
    <>
      <section className="search-hero knowledge-search-hero" aria-labelledby="search-title">
        <div className="hero-kicker"><span>01</span> VNDB visual association search</div>
        <h1 id="search-title">从一个名字，<br />翻开整条关系链。</h1>
        <p>搜索作品、角色或声优。每一次点击都会保留为可返回的探索路径。</p>

        <form className="search-console" onSubmit={submit}>
          <fieldset className="search-type-group">
            <legend>搜索类型</legend>
            <div className="search-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={type === tab.value}
                  onClick={() => changeType(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label htmlFor="knowledge-search">{tabs.find((tab) => tab.value === type)?.hint}</label>
          <div className="search-row">
            <input
              id="knowledge-search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                type === "vn"
                  ? "试试 Ever17、时空轮回或 v17"
                  : type === "tag"
                    ? "试试 悬疑、时间旅行或 g19"
                    : "输入名称或 VNDB ID"
              }
              autoComplete="off"
            />
            <button type="submit">开始查找</button>
          </div>
        </form>
      </section>

      <section className="results-section knowledge-results" aria-live="polite">
        <SectionHeading
          index="02"
          title={query ? `“${query}”的搜索结果` : "等待一个起点"}
          note={query ? "优先显示原文与图片，罗马字作为辅助定位。" : "首版搜索直接使用 VNDB Kana API。"}
        />

        {!query ? (
          <StatePanel title="输入你记得的名字">
            <p>不需要先判断它是中文标题、日文原名还是罗马字别名。</p>
          </StatePanel>
        ) : search.isPending ? (
          <LoadingScene compact title="正在检索资料柜" note="首批 12 条结果准备好后会一次展开。" />
        ) : search.isError ? (
          <StatePanel title="暂时没有拿到结果" tone="error">
            <p>{search.error.message}</p>
            <button type="button" onClick={() => search.refetch()}>重新请求</button>
          </StatePanel>
        ) : items.length ? (
          <>
            <div className="entity-grid">
              {items.map((entity) => <EntityCard key={entity.id} entity={entity} />)}
            </div>
            <AutoPageLoader
              hasNextPage={buffered.canRevealNextPage}
              isFetching={buffered.isWaitingForBuffer}
              buffered={buffered.hasBufferedPage}
              onLoad={() => void buffered.revealNextPage()}
              label={buffered.hasBufferedPage ? "下一页已准备好" : "继续浏览搜索结果"}
            />
          </>
        ) : (
          <StatePanel title="没有匹配条目">
            <p>尝试原文、罗马字、别名或直接输入 VNDB ID。</p>
          </StatePanel>
        )}
      </section>
    </>
  );
}
