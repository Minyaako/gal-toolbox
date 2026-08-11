import { useCallback, useEffect, useMemo, useReducer } from "react";
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

export function advanceIntersectionLatch(
  armed: boolean,
  isIntersecting: boolean,
): { armed: boolean; shouldLoad: boolean } {
  if (!isIntersecting) return { armed: true, shouldLoad: false };
  if (!armed) return { armed: false, shouldLoad: false };
  return { armed: false, shouldLoad: true };
}

type FetchNextPageResult<T> = {
  data?: { pages: Array<Page<T>> };
};

export function createBufferedPageFetcher<T>(
  fetchNextPage: (priority: "high" | "normal") => Promise<FetchNextPageResult<T>>,
  promoteNextPage: (signal: AbortSignal) => Promise<unknown>,
) {
  let pending: Promise<FetchNextPageResult<T>> | null = null;
  let promotionController: AbortController | null = null;
  const prefetch = () => {
    if (!pending) {
      const request = fetchNextPage("normal");
      const tracked = request.finally(() => {
        if (pending === tracked) pending = null;
      });
      pending = tracked;
    }
    return pending;
  };
  return {
    prefetch,
    async fetchForReveal() {
      if (pending) {
        if (!promotionController) {
          const controller = new AbortController();
          promotionController = controller;
          void promoteNextPage(controller.signal)
            .catch(() => undefined)
            .finally(() => {
              if (promotionController === controller) promotionController = null;
            });
        }
        return pending;
      }
      return fetchNextPage("high");
    },
    dispose() {
      promotionController?.abort();
      promotionController = null;
    },
  };
}

export function useBufferedPages<T>({
  scope,
  pages,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  promoteNextPage,
}: {
  scope: string;
  pages: Array<Page<T>>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: (priority: "high" | "normal") => Promise<FetchNextPageResult<T>>;
  promoteNextPage: (signal: AbortSignal) => Promise<unknown>;
}) {
  const [state, dispatch] = useReducer(reduceBufferedPage, {
    scope,
    visiblePageCount: 1,
  });
  const visiblePageCount =
    state.scope === scope ? state.visiblePageCount : 1;
  const buffered = hasBufferedPage(pages, visiblePageCount);
  const requests = useMemo(
    () => createBufferedPageFetcher(fetchNextPage, promoteNextPage),
    [fetchNextPage, promoteNextPage],
  );

  useEffect(() => {
    dispatch({ type: "sync-scope", scope });
  }, [scope]);

  useEffect(() => () => requests.dispose(), [requests, scope]);

  useEffect(() => {
    if (
      shouldFetchBuffer({
        loadedPageCount: pages.length,
        visiblePageCount,
        hasNextPage,
        isFetchingNextPage,
      })
    ) {
      void requests.prefetch();
    }
  }, [
    requests,
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
    if (!hasNextPage) return;

    const result = await requests.fetchForReveal();
    dispatch({
      type: "reveal",
      loadedPageCount: result.data?.pages.length ?? pages.length,
    });
  }, [
    hasNextPage,
    pages,
    requests,
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
