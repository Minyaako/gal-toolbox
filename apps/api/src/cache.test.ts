import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cacheKey, CacheStore } from "./cache.js";

const paths: string[] = [];

afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("CacheStore", () => {
  it("persists JSON values", () => {
    const directory = mkdtempSync(join(tmpdir(), "gal-toolbox-"));
    paths.push(directory);
    const cache = new CacheStore(join(directory, "cache.sqlite"));
    cache.set("key", { title: "时空轮回" }, 1_000);
    expect(cache.get<{ title: string }>("key")?.value.title).toBe("时空轮回");
    cache.close();
  });

  it("builds identical keys for differently ordered objects", () => {
    expect(cacheKey("/vn", { b: 2, a: 1 })).toBe(cacheKey("/vn", { a: 1, b: 2 }));
  });
});

