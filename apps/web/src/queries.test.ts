import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtistDetail, ArtistWork, EntitySummary, Page, TagDetail, VnDetail } from "./api";
import {
  artistQuery,
  artistVnsQuery,
  characterQuery,
  prefetchEntity,
  prefetchArtist,
  promoteArtist,
  promoteEntity,
  searchQuery,
  staffCharactersQuery,
  staffQuery,
  tagQuery,
  tagVnsQuery,
  vnQuery,
} from "./queries";

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
  artists: [],
};

const artistEntity: EntitySummary = {
  id: "s1928",
  type: "staff",
  name: { primary: "Artist", original: "Artist Original", romanized: "Artist Romanized", alternatives: [] },
  image: null,
};

const artistDetail: ArtistDetail = {
  entity: artistEntity,
  description: "Artist biography",
  language: "ja",
  aliases: [],
  externalLinks: [],
};

const artistWorks: Page<ArtistWork> = {
  items: [{ vn: vnEntity, credits: [{ role: "art", note: null }] }],
  page: 1,
  pageSize: 12,
  more: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("intent prefetch", () => {
  it("keeps artist detail and work cache entries isolated while preloading first-page covers", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const priorities: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      priorities.push(new Headers(init?.headers).get("X-Request-Priority") ?? "");
      const body = String(input).includes("/vns?") ? artistWorks : artistDetail;
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const preload = vi.fn();

    await prefetchArtist(queryClient, artistEntity, preload);

    expect(artistQuery("s1928").queryKey).toEqual(["artist", "s1928"]);
    expect(artistVnsQuery("s1928").queryKey).toEqual(["artist-vns", "s1928"]);
    expect(queryClient.getQueryData(["artist", "s1928"])).toEqual(artistDetail);
    expect(queryClient.getQueryData(["artist-vns", "s1928"])).toEqual({ pages: [artistWorks], pageParams: [1] });
    expect(queryClient.getQueryData(["staff", "s1928"])).toBeUndefined();
    expect(queryClient.getQueryData(["staff-characters", "s1928"])).toBeUndefined();
    expect(priorities).toEqual(["low", "low"]);
    expect(preload).toHaveBeenCalledWith("https://t.vndb.org/cv/17-thumb.jpg");
  });

  it("sends direct high promotions for artist detail and first work page", async () => {
    const urls: string[] = [];
    const priorities: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      urls.push(String(input));
      priorities.push(new Headers(init?.headers).get("X-Request-Priority") ?? "");
      return new Response(JSON.stringify(String(input).includes("/vns?") ? artistWorks : artistDetail), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }));

    await promoteArtist("s1928");

    expect(urls).toEqual([
      "/api/v1/artists/s1928?_priorityPromotion=1",
      "/api/v1/artists/s1928/vns?page=1&pageSize=12&_priorityPromotion=1",
    ]);
    expect(priorities).toEqual(["high", "high"]);
  });
  it("sends a separate high promotion while the low detail prefetch is pending", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const priorities: string[] = [];
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      urls.push(String(input));
      priorities.push(new Headers(init?.headers).get("X-Request-Priority") ?? "");
      await gate;
      return new Response(JSON.stringify(vnDetail), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const low = prefetchEntity(queryClient, vnEntity, vi.fn());
    await vi.waitFor(() => expect(priorities).toEqual(["low"]));
    const high = promoteEntity(vnEntity);
    await vi.waitFor(() => expect(priorities).toEqual(["low", "high"]));
    expect(urls).toEqual([
      "/api/v1/vns/v17",
      "/api/v1/vns/v17?_priorityPromotion=1",
    ]);

    release();
    await Promise.all([low, high]);
  });

  it("admits only three distinct low intent prefetches until a slot settles", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const startedIds: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const id = String(input).match(/\/vns\/(v\d+)/)?.[1] ?? "missing";
      startedIds.push(id);
      await gate;
      return new Response(JSON.stringify({
        ...vnDetail,
        entity: { ...vnDetail.entity, id },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
    const entities = ["v1", "v2", "v3", "v4"].map((id) => ({ ...vnEntity, id }));

    const firstWave = entities.map((item) => prefetchEntity(queryClient, item, vi.fn()));
    await vi.waitFor(() => expect(startedIds).toEqual(["v1", "v2", "v3"]));
    release();
    await Promise.all(firstWave);

    await prefetchEntity(queryClient, entities[3]!, vi.fn());
    expect(startedIds).toEqual(["v1", "v2", "v3", "v4"]);
  });

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

describe("query request semantics", () => {
  it("keeps detail and search keys stable while forwarding high priority and signals", async () => {
    const calls: Array<{ signal?: AbortSignal; priority?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
      calls.push({
        signal: init?.signal ?? undefined,
        priority: new Headers(init?.headers).get("X-Request-Priority") ?? undefined,
      });
      return new Response(JSON.stringify({ results: [], items: [], more: false, page: 1, pageSize: 12 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
    const detailSignal = new AbortController().signal;
    const searchSignal = new AbortController().signal;
    const detailFn = vnQuery("v17").queryFn as (context: { signal: AbortSignal }) => Promise<unknown>;
    const searchFn = searchQuery("vn", "Ever17").queryFn as (context: { signal: AbortSignal; pageParam: number }) => Promise<unknown>;

    await detailFn({ signal: detailSignal });
    await searchFn({ signal: searchSignal, pageParam: 1 });

    expect(vnQuery("v17").queryKey).toEqual(["vn", "v17"]);
    expect(calls).toEqual([
      { signal: detailSignal, priority: "high" },
      { signal: searchSignal, priority: "high" },
    ]);
  });

  it("uses high for a new search page one after normal automatic buffering", async () => {
    const priorities: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
      priorities.push(new Headers(init?.headers).get("X-Request-Priority") ?? "");
      return new Response(JSON.stringify({ items: [], more: true, page: 1, pageSize: 12 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
    let nextPagePriority: "high" | "normal" = "high";
    const firstSearch = searchQuery("vn", "a", () => nextPagePriority);
    const firstQueryFn = firstSearch.queryFn as (context: {
      signal: AbortSignal;
      pageParam: number;
    }) => Promise<unknown>;
    await firstQueryFn({ signal: new AbortController().signal, pageParam: 1 });
    nextPagePriority = "normal";
    await firstQueryFn({ signal: new AbortController().signal, pageParam: 2 });

    const activeSearch = searchQuery("vn", "Ever17", () => nextPagePriority);
    await (activeSearch.queryFn as (context: {
      signal: AbortSignal;
      pageParam: number;
    }) => Promise<unknown>)({
      signal: new AbortController().signal,
      pageParam: 1,
    });

    expect(priorities).toEqual(["high", "normal", "high"]);
  });

  it("uses high for all detail queries and normal for relation pages", async () => {
    const priorities: string[] = [];
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
      priorities.push(new Headers(init?.headers).get("X-Request-Priority") ?? "");
      signals.push(init?.signal as AbortSignal);
      return new Response(JSON.stringify({ results: [], items: [], more: false, page: 1, pageSize: 12 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
    const factories = [characterQuery("c1"), staffQuery("s1"), tagQuery("g1")];
    for (const options of factories) {
      const signal = new AbortController().signal;
      await (options.queryFn as (context: { signal: AbortSignal }) => Promise<unknown>)({ signal });
      expect(signals.at(-1)).toBe(signal);
    }
    for (const options of [staffCharactersQuery("s1"), tagVnsQuery("g1")]) {
      const signal = new AbortController().signal;
      await (options.queryFn as (context: { signal: AbortSignal; pageParam: number }) => Promise<unknown>)({ signal, pageParam: 1 });
      expect(signals.at(-1)).toBe(signal);
    }
    expect(priorities).toEqual(["high", "high", "high", "normal", "normal"]);
  });

  it("uses low priority for intent prefetch", async () => {
    let priority: string | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
      priority = new Headers(init?.headers).get("X-Request-Priority");
      return new Response(JSON.stringify(vnDetail), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await prefetchEntity(queryClient, vnEntity, vi.fn());
    expect(priority).toBe("low");
  });
});
