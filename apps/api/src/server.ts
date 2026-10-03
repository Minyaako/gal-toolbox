import { resolve } from "node:path";
import { buildApp } from "./app.js";
import { startCacheMaintenance } from "./cache-maintenance.js";
import { CacheStore } from "./cache.js";
import { RankingStore } from "./ranking-store.js";

const cachePath = resolve(process.env.CACHE_DB_PATH ?? "data/cache.sqlite");
const cache = new CacheStore(cachePath);
cache.prune();

const rankingPath = resolve(process.env.RANKING_DB_PATH ?? "data/rankings.sqlite");
if (rankingPath.toLowerCase() === cachePath.toLowerCase()) throw new Error("Ranking and cache databases must use separate paths");
const rankingStore = new RankingStore(rankingPath);
const trustProxy = process.env.TRUST_PROXY_CIDRS?.trim();
const app = await buildApp({ cache, rankingStore, ...(trustProxy ? { trustProxy } : {}), logger: true });
const stopCacheMaintenance = startCacheMaintenance(cache, {
  onError: (error) => app.log.error({ err: error }, "Cache prune failed"),
});
const port = Number(process.env.PORT ?? 8787);

await app.listen({ host: "0.0.0.0", port });

async function shutdown(): Promise<void> {
  stopCacheMaintenance();
  await app.close();
  cache.close();
  rankingStore.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

