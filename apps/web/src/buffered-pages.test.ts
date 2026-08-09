import { describe, expect, it } from "vitest";
import type { Page } from "./api";
import {
  hasBufferedPage,
  reduceBufferedPage,
  selectVisibleItems,
  shouldFetchBuffer,
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
});
