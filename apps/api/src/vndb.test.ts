import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheKey, CacheStore } from "./cache.js";
import { cleanVndbText, mapTagSummary, resolvePersonName, resolveVnName, VndbClient } from "./vndb.js";

const stores: CacheStore[] = [];

function createStore() {
  const store = new CacheStore(":memory:");
  stores.push(store);
  return store;
}

afterEach(() => {
  vi.useRealTimers();
  stores.splice(0).forEach((store) => store.close());
});

describe("VndbClient scheduling", () => {
  it("returns a fresh cache hit without scheduler or fetch work", async () => {
    const cache = createStore();
    const body = { filters: ["id", "=", "v17"] };
    cache.set(cacheKey("/vn", body), { results: [{ id: "v17" }], more: false }, 60_000);
    const fetcher = vi.fn<typeof fetch>();
    const client = new VndbClient(cache, fetcher, 0);

    await expect(client.query("/vn", body, 60_000, { priority: "high" })).resolves.toMatchObject({
      cacheStatus: "HIT",
      queueWaitMs: 0,
      upstreamDurationMs: 0,
      queueDepth: 0,
      priority: "high",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns stale cache after a non-abort upstream error", async () => {
    const cache = createStore();
    const body = { filters: ["id", "=", "v17"] };
    cache.set(cacheKey("/vn", body), { results: [{ id: "stale" }], more: false }, -1);
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("network unavailable"));
    const client = new VndbClient(cache, fetcher, 0);

    await expect(client.query("/vn", body, 60_000)).resolves.toMatchObject({
      cacheStatus: "STALE",
      data: { results: [{ id: "stale" }] },
    });
  });

  it("keeps client abort distinct from timeout and never serves stale for either", async () => {
    const cache = createStore();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) {
        reject(init.signal.reason);
        return;
      }
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const client = new VndbClient(cache, fetcher, 0, 10);
    const controller = new AbortController();
    const aborted = client.query("/vn", { id: "aborted" }, 60_000, { signal: controller.signal });
    const abortRejection = expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await abortRejection;

    const timedOut = client.query("/vn", { id: "timed-out" }, 60_000);
    const timeoutRejection = expect(timedOut).rejects.toMatchObject({ name: "TimeoutError" });
    await timeoutRejection;
  });
});

describe("name resolution", () => {
  it("prefers simplified Chinese VN titles", () => {
    const name = resolveVnName({
      id: "v17",
      title: "Ever17 -the out of infinity-",
      alttitle: "Ever17 -the out of infinity-",
      titles: [
        { lang: "ja", title: "Ever17 -the out of infinity-", main: true },
        { lang: "zh-Hans", title: "时空轮回" },
      ],
    });
    expect(name.primary).toBe("时空轮回");
    expect(name.romanized).toBe("Ever17 -the out of infinity-");
  });

  it("uses original person names as the primary label", () => {
    const name = resolvePersonName({ id: "s81", name: "Asakawa Yuu", original: "浅川 悠" });
    expect(name.primary).toBe("浅川 悠");
    expect(name.romanized).toBe("Asakawa Yuu");
  });
});

describe("VNDB formatting", () => {
  it("keeps readable labels while removing formatting codes", () => {
    expect(cleanVndbText("From [url=https://example.com]Wikipedia[/url]"))
      .toBe("From Wikipedia");
  });
});

describe("tag mapping", () => {
  it("maps a VNDB tag into the shared entity shape", () => {
    expect(mapTagSummary({ id: "g19", name: "Mystery", aliases: ["Mysteries"] }))
      .toMatchObject({
        id: "g19",
        type: "tag",
        name: {
          primary: "悬疑",
          original: "Mystery",
          alternatives: ["Mysteries"],
        },
        image: null,
      });
  });
});
