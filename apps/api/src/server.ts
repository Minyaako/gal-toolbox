import { resolve } from "node:path";
import { buildApp } from "./app.js";
import { startCacheMaintenance } from "./cache-maintenance.js";
import { CacheStore } from "./cache.js";

const cachePath = resolve(process.env.CACHE_DB_PATH ?? "data/cache.sqlite");
const cache = new CacheStore(cachePath);
cache.prune();

const app = await buildApp({ cache, logger: true });
const stopCacheMaintenance = startCacheMaintenance(cache, {
  onError: (error) => app.log.error({ err: error }, "Cache prune failed"),
});
const port = Number(process.env.PORT ?? 8787);

await app.listen({ host: "0.0.0.0", port });

async function shutdown(): Promise<void> {
  stopCacheMaintenance();
  await app.close();
  cache.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

