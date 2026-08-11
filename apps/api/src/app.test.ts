import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { CacheStore } from "./cache.js";
import { VndbClient } from "./vndb.js";

const cleanup: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose();
});

async function createTestApp(fetcher: typeof fetch) {
  const directory = mkdtempSync(join(tmpdir(), "gal-toolbox-app-"));
  const cache = new CacheStore(join(directory, "cache.sqlite"));
  const app = await buildApp({ cache, client: new VndbClient(cache, fetcher, 0) });
  cleanup.push(
    async () => app.close(),
    () => cache.close(),
    () => rmSync(directory, { recursive: true, force: true }),
  );
  return app;
}

describe("public API", () => {
  it("forwards high priority and exposes queue and upstream timing", async () => {
    const app = await createTestApp((async () => new Response(JSON.stringify({
      results: [{ id: "v17", title: "Ever17", titles: [], aliases: [], image: null }],
      more: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/vns/v17",
      headers: { "X-Request-Priority": "high" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-priority"]).toBe("high");
    expect(response.headers["server-timing"]).toMatch(
      /queue;dur=\d+(?:\.\d+)?, upstream;dur=\d+(?:\.\d+)?/,
    );
  });

  it("aborts VNDB work when the browser disconnects", async () => {
    let upstreamSignal: AbortSignal | undefined;
    let signalRecorded!: () => void;
    const recorded = new Promise<void>((resolve) => { signalRecorded = resolve; });
    const app = await createTestApp((async (_input, init) => new Promise<Response>((_resolve, reject) => {
      upstreamSignal = init?.signal ?? undefined;
      signalRecorded();
      upstreamSignal?.addEventListener("abort", () => reject(upstreamSignal?.reason), { once: true });
    })) as typeof fetch);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const controller = new AbortController();
    const request = fetch(`http://127.0.0.1:${address.port}/api/v1/vns/v17`, {
      signal: controller.signal,
    });
    await recorded;
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(upstreamSignal?.aborted).toBe(true);
  });

  it("serves OpenAPI and the Tag exploration endpoints", async () => {
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { fields?: string };
      const isTag = String(input).endsWith("/tag");
      const payload = isTag
        ? {
            results: [{ id: "g19", name: "Mystery", category: "cont", vn_count: 42, description: "A mystery." }],
            more: false,
          }
        : {
            results: [{ id: "v17", title: "Ever17", titles: [], aliases: [], image: null }],
            more: false,
          };
      expect(body.fields).toBeTruthy();
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    const app = await createTestApp(fetcher);

    const spec = await app.inject({ method: "GET", url: "/api/v1/openapi.json" });
    expect(spec.statusCode).toBe(200);
    expect(spec.json()).toMatchObject({ openapi: "3.1.0" });

    const tag = await app.inject({ method: "GET", url: "/api/v1/tags/g19" });
    expect(tag.statusCode).toBe(200);
    expect(tag.headers["cache-control"]).toBe("public, max-age=300");
    expect(tag.json()).toMatchObject({
      entity: {
        id: "g19",
        type: "tag",
        name: { primary: "悬疑", original: "Mystery" },
      },
      vnCount: 42,
    });

    const novels = await app.inject({ method: "GET", url: "/api/v1/tags/g19/vns?page=1&pageSize=12" });
    expect(novels.statusCode).toBe(200);
    expect(novels.headers["cache-control"]).toBe("public, max-age=60");
    expect(novels.json()).toMatchObject({ pageSize: 12, items: [{ id: "v17", type: "vn" }] });
  });

  it("maps VNDB network failures to the upstream-unavailable response", async () => {
    const fetcher = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const app = await createTestApp(fetcher);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/search?type=vn&q=v17&page=1&pageSize=1",
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: { code: "UPSTREAM_UNAVAILABLE" },
    });
  });

  it("searches translated Tags locally and caches list responses for one minute", async () => {
    const app = await createTestApp((async () => {
      throw new Error("VNDB must not be called for Chinese Tag search");
    }) as typeof fetch);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/search?type=tag&q=悬疑&page=1&pageSize=12",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=60");
    expect(response.headers["x-cache"]).toBe("LOCAL");
    const body = response.json();
    expect(body).toMatchObject({
      page: 1,
      pageSize: 12,
      more: false,
    });
    expect(body.items[0]).toMatchObject({
      id: "g19",
      name: { primary: "悬疑", original: "Mystery" },
    });
  });
});
