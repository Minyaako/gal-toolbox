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

describe("public API", () => {
  it("serves OpenAPI and the Tag exploration endpoints", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gal-toolbox-app-"));
    const cache = new CacheStore(join(directory, "cache.sqlite"));
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { fields?: string };
      const isTag = String(input).endsWith("/tag");
      const payload = isTag
        ? {
            results: [{ id: "g7", name: "Mystery", category: "cont", vn_count: 42, description: "A mystery." }],
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
    const app = await buildApp({ cache, client: new VndbClient(cache, fetcher, 0) });
    cleanup.push(async () => app.close(), () => cache.close(), () => rmSync(directory, { recursive: true, force: true }));

    const spec = await app.inject({ method: "GET", url: "/api/v1/openapi.json" });
    expect(spec.statusCode).toBe(200);
    expect(spec.json()).toMatchObject({ openapi: "3.1.0" });

    const tag = await app.inject({ method: "GET", url: "/api/v1/tags/g7" });
    expect(tag.statusCode).toBe(200);
    expect(tag.json()).toMatchObject({ entity: { id: "g7", type: "tag" }, vnCount: 42 });

    const novels = await app.inject({ method: "GET", url: "/api/v1/tags/g7/vns?page=1&pageSize=12" });
    expect(novels.statusCode).toBe(200);
    expect(novels.json()).toMatchObject({ pageSize: 12, items: [{ id: "v17", type: "vn" }] });
  });
});
