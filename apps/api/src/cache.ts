import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

type CacheRow = {
  payload: string;
  expires_at: number;
};

export type CachedValue<T> = {
  value: T;
  expired: boolean;
};

export class CacheStore {
  readonly database: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS http_cache (
        cache_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_http_cache_expires_at
        ON http_cache(expires_at);
    `);
  }

  get<T>(key: string): CachedValue<T> | null {
    const row = this.database
      .prepare("SELECT payload, expires_at FROM http_cache WHERE cache_key = ?")
      .get(key) as CacheRow | undefined;

    if (!row) return null;
    return {
      value: JSON.parse(row.payload) as T,
      expired: row.expires_at <= Date.now(),
    };
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    const now = Date.now();
    this.database
      .prepare(`
        INSERT INTO http_cache(cache_key, payload, expires_at, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          payload = excluded.payload,
          expires_at = excluded.expires_at,
          created_at = excluded.created_at
      `)
      .run(key, JSON.stringify(value), now + ttlMs, now);
  }

  prune(): void {
    const keepStaleUntil = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.database
      .prepare("DELETE FROM http_cache WHERE expires_at < ?")
      .run(keepStaleUntil);
  }

  close(): void {
    this.database.close();
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function cacheKey(endpoint: string, body: unknown): string {
  const canonical = JSON.stringify(canonicalize(body));
  const digest = createHash("sha256").update(canonical).digest("hex");
  return `dto-v2:${endpoint}:${digest}`;
}
