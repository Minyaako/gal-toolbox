import { useCallback, useEffect, useReducer } from "react";
import type { Page } from "./api";

export type BufferedPageState = {
  scope: string;
  visiblePageCount: number;
};

export type BufferedPageAction =
  | { type: "sync-scope"; scope: string }
  | { type: "reveal"; loadedPageCount: number };

export function reduceBufferedPage(
  state: BufferedPageState,
  action: BufferedPageAction,
): BufferedPageState {
  if (action.type === "sync-scope") {
    return action.scope === state.scope
      ? state
      : { scope: action.scope, visiblePageCount: 1 };
  }
  return {
    ...state,
    visiblePageCount: Math.min(
      state.visiblePageCount + 1,
      action.loadedPageCount,
    ),
  };
}

export function selectVisibleItems<T>(
  pages: Array<Page<T>>,
  visiblePageCount: number,
): T[] {
  return pages
    .slice(0, visiblePageCount)
    .flatMap((page) => page.items);
}

export function hasBufferedPage<T>(
  pages: Array<Page<T>>,
  visiblePageCount: number,
): boolean {
  return pages.length > visiblePageCount;
}

export function shouldFetchBuffer({
  loadedPageCount,
  visiblePageCount,
  hasNextPage,
  isFetchingNextPage,
}: {
  loadedPageCount: number;
  visiblePageCount: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}): boolean {
  return (
    hasNextPage &&
    !isFetchingNextPage &&
    loadedPageCount <= visiblePageCount
  );
}

type FetchNextPageResult<T> = {
  data?: { pages: Array<Page<T>> };
};

export function useBufferedPages<T>({
  scope,
  pages,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  scope: string;
  pages: Array<Page<T>>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<FetchNextPageResult<T>>;
}) {
  const [state, dispatch] = useReducer(reduceBufferedPage, {
    scope,
    visiblePageCount: 1,
  });
  const visiblePageCount =
    state.scope === scope ? state.visiblePageCount : 1;
  const buffered = hasBufferedPage(pages, visiblePageCount);

  useEffect(() => {
    dispatch({ type: "sync-scope", scope });
  }, [scope]);

  useEffect(() => {
    if (
      shouldFetchBuffer({
        loadedPageCount: pages.length,
        visiblePageCount,
        hasNextPage,
        isFetchingNextPage,
      })
    ) {
      void fetchNextPage();
    }
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    pages.length,
    visiblePageCount,
  ]);

  const revealNextPage = useCallback(async () => {
    if (hasBufferedPage(pages, visiblePageCount)) {
      dispatch({ type: "reveal", loadedPageCount: pages.length });
      return;
    }
    if (!hasNextPage || isFetchingNextPage) return;

    const result = await fetchNextPage();
    dispatch({
      type: "reveal",
      loadedPageCount: result.data?.pages.length ?? pages.length,
    });
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    pages,
    visiblePageCount,
  ]);

  return {
    items: selectVisibleItems(pages, visiblePageCount),
    hasBufferedPage: buffered,
    canRevealNextPage: buffered || hasNextPage,
    isWaitingForBuffer: isFetchingNextPage && !buffered,
    revealNextPage,
    visiblePageCount,
  };
}
