import { describe, expect, it, vi } from "vitest";
import type { Page } from "./api";
import {
  advanceIntersectionLatch,
  hasBufferedPage,
  reduceBufferedPage,
  selectVisibleItems,
  shouldFetchBuffer,
  createBufferedPageFetcher,
} from "./buffered-pages";

const page = (
  items: string[],
  pageNumber: number,
  more: boolean,
): Page<string> => ({
  items,
  page: pageNumber,
  pageSize: 2,
  more,
});

describe("buffered pagination state", () => {
  it("keeps the second loaded page hidden until one reveal", () => {
    const pages = [
      page(["a", "b"], 1, true),
      page(["c", "d"], 2, true),
    ];

    expect(selectVisibleItems(pages, 1)).toEqual(["a", "b"]);
    expect(hasBufferedPage(pages, 1)).toBe(true);
    expect(
      reduceBufferedPage(
        { scope: "q", visiblePageCount: 1 },
        { type: "reveal", loadedPageCount: 2 },
      ),
    ).toEqual({ scope: "q", visiblePageCount: 2 });
  });

  it("reveals at most one page and resets when scope changes", () => {
    const revealed = reduceBufferedPage(
      { scope: "same", visiblePageCount: 1 },
      { type: "reveal", loadedPageCount: 4 },
    );
    expect(revealed.visiblePageCount).toBe(2);

    expect(
      reduceBufferedPage(revealed, { type: "sync-scope", scope: "new" }),
    ).toEqual({ scope: "new", visiblePageCount: 1 });
  });

  it("requests a buffer only when no hidden loaded page exists", () => {
    expect(
      shouldFetchBuffer({
        loadedPageCount: 1,
        visiblePageCount: 1,
        hasNextPage: true,
        isFetchingNextPage: false,
      }),
    ).toBe(true);
    expect(
      shouldFetchBuffer({
        loadedPageCount: 2,
        visiblePageCount: 1,
        hasNextPage: true,
        isFetchingNextPage: false,
      }),
    ).toBe(false);
  });

  it("requires leaving the trigger zone before another automatic reveal", () => {
    let armed = true;
    const loads: boolean[] = [];
    for (const isIntersecting of [true, true, true, false, true]) {
      const next = advanceIntersectionLatch(armed, isIntersecting);
      armed = next.armed;
      loads.push(next.shouldLoad);
    }
    expect(loads).toEqual([true, false, false, false, true]);
  });

  it("starts automatic buffering at normal priority", async () => {
    const fetchNextPage = vi.fn(async () => ({ data: { pages: [page(["a"], 1, true)] } }));
    const requests = createBufferedPageFetcher(fetchNextPage, vi.fn());
    await requests.prefetch();
    expect(fetchNextPage).toHaveBeenCalledWith("normal");
  });

  it("promotes a pending normal request, awaits it, then reveals one page", async () => {
    let resolve!: (value: { data: { pages: Array<Page<string>> } }) => void;
    const pending = new Promise<{ data: { pages: Array<Page<string>> } }>((done) => { resolve = done; });
    const fetchNextPage = vi.fn(() => pending);
    const promoteNextPage = vi.fn(async () => undefined);
    const requests = createBufferedPageFetcher(fetchNextPage, promoteNextPage);
    const normal = requests.prefetch();
    const reveal = requests.fetchForReveal();
    await Promise.resolve();
    expect(promoteNextPage).toHaveBeenCalledTimes(1);
    let settled = false;
    void reveal.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    const result = { data: { pages: [page(["a"], 1, true), page(["b"], 2, false)] } };
    resolve(result);
    await expect(reveal).resolves.toBe(result);
    await normal;
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
