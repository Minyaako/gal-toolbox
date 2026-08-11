import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntitySummary, Page, TagDetail, VnDetail } from "./api";
import { prefetchEntity } from "./queries";

const vnEntity: EntitySummary = {
  id: "v17",
  type: "vn",
  name: {
    primary: "时空轮回",
    original: null,
    romanized: "Ever17 -the out of infinity-",
    alternatives: [],
  },
  image: {
    url: "https://t.vndb.org/cv/17.jpg",
    thumbnailUrl: "https://t.vndb.org/cv/17-thumb.jpg",
    sexual: 0,
    violence: 0,
  },
};

const vnDetail: VnDetail = {
  entity: vnEntity,
  description: null,
  released: "2002-08-29",
  rating: 84.5,
  voteCount: 8678,
  relations: [],
  cast: [],
  tags: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("intent prefetch", () => {
  it("deduplicates concurrent VN requests and preloads the returned cover", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(vnDetail), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const preload = vi.fn();

    await Promise.all([
      prefetchEntity(queryClient, vnEntity, preload),
      prefetchEntity(queryClient, vnEntity, preload),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["vn", "v17"])).toEqual(vnDetail);
    expect(preload).toHaveBeenCalledWith("https://t.vndb.org/cv/17-thumb.jpg");
  });

  it("caches a Tag detail and its first VN page before navigation", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const tagEntity: EntitySummary = {
      id: "g19",
      type: "tag",
      name: {
        primary: "悬疑",
        original: "Mystery",
        romanized: null,
        alternatives: [],
      },
      image: null,
    };
    const tagDetail: TagDetail = {
      entity: tagEntity,
      description: "Mystery stories.",
      category: "cont",
      vnCount: 5387,
    };
    const page: Page<EntitySummary> = {
      items: [vnEntity],
      page: 1,
      pageSize: 12,
      more: true,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const body = String(input).includes("/vns?") ? page : tagDetail;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    await prefetchEntity(queryClient, tagEntity, vi.fn());

    expect(queryClient.getQueryData(["tag", "g19"])).toEqual(tagDetail);
    expect(queryClient.getQueryData(["tag-vns", "g19"])).toEqual({
      pages: [page],
      pageParams: [1],
    });
  });
});
