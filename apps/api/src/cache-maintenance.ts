import type { CacheStore } from "./cache.js";

const ONE_HOUR_MS = 60 * 60 * 1000;

type CachePruner = Pick<CacheStore, "prune">;

type MaintenanceOptions = {
  intervalMs?: number;
  onError?: (error: unknown) => void;
};

export function startCacheMaintenance(
  cache: CachePruner,
  options: MaintenanceOptions = {},
): () => void {
  const onError =
    options.onError ?? ((error) => console.error("Cache prune failed", error));
  const timer = setInterval(() => {
    try {
      cache.prune();
    } catch (error) {
      onError(error);
    }
  }, options.intervalMs ?? ONE_HOUR_MS);
  timer.unref();
  return () => clearInterval(timer);
}
