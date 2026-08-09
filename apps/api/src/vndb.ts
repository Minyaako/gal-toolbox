import { cacheKey, type CacheStore } from "./cache.js";
import type {
  CacheStatus,
  EntityImage,
  EntityName,
  EntitySummary,
} from "./types.js";

const VNDB_API = "https://api.vndb.org/kana";

type VndbResponse<T> = {
  results: T[];
  more: boolean;
};

type QueryResult<T> = {
  data: VndbResponse<T>;
  cacheStatus: CacheStatus;
};

type FetchLike = typeof fetch;

export class VndbError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`VNDB request failed with ${status}`);
  }
}

class RequestPacer {
  private nextStartAt = 0;
  private tail = Promise.resolve();

  constructor(private readonly intervalMs: number) {}

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const waitMs = Math.max(0, this.nextStartAt - Date.now());
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.nextStartAt = Date.now() + this.intervalMs;
      return task();
    });
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export class VndbClient {
  private readonly inFlight = new Map<string, Promise<QueryResult<unknown>>>();
  private readonly pacer: RequestPacer;

  constructor(
    private readonly cache: CacheStore,
    private readonly fetcher: FetchLike = fetch,
    intervalMs = Number(process.env.VNDB_MIN_INTERVAL_MS ?? 1500),
  ) {
    this.pacer = new RequestPacer(intervalMs);
  }

  async query<T>(
    endpoint: string,
    body: Record<string, unknown>,
    ttlMs: number,
  ): Promise<QueryResult<T>> {
    const key = cacheKey(endpoint, body);
    const cached = this.cache.get<VndbResponse<T>>(key);
    if (cached && !cached.expired) {
      return { data: cached.value, cacheStatus: "HIT" };
    }

    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<QueryResult<T>>;

    const request = this.pacer.schedule(async () => {
      try {
        const response = await this.fetcher(`${VNDB_API}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "gal-toolbox/0.1 (+https://github.com/Minyaako/gal-toolbox)",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(12_000),
        });

        if (!response.ok) {
          throw new VndbError(response.status, await response.text());
        }

        const data = (await response.json()) as VndbResponse<T>;
        this.cache.set(key, data, ttlMs);
        return { data, cacheStatus: "MISS" as const };
      } catch (error) {
        if (cached) {
          return { data: cached.value, cacheStatus: "STALE" as const };
        }
        throw error;
      } finally {
        this.inFlight.delete(key);
      }
    });

    this.inFlight.set(key, request as Promise<QueryResult<unknown>>);
    return request;
  }
}

type RawImage = {
  url?: string | null;
  thumbnail?: string | null;
  sexual?: number | null;
  violence?: number | null;
} | null;

type RawTitle = {
  lang: string;
  title: string;
  latin?: string | null;
  main?: boolean;
};

export type RawVn = {
  id: string;
  title: string;
  alttitle?: string | null;
  titles?: RawTitle[];
  aliases?: string[];
  image?: RawImage;
};

export type RawCharacter = {
  id: string;
  name: string;
  original?: string | null;
  aliases?: string[];
  image?: RawImage;
};

export type RawStaff = {
  id: string;
  name: string;
  original?: string | null;
  aliases?: Array<{
    name: string;
    latin?: string | null;
    ismain?: boolean;
  }>;
};

export type RawTag = {
  id: string;
  name: string;
  aliases?: string[];
  description?: string | null;
  category?: "cont" | "ero" | "tech";
  vn_count?: number;
};

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

export function mapImage(image: RawImage | undefined): EntityImage {
  if (!image?.url) return null;
  return {
    url: image.url,
    thumbnailUrl: image.thumbnail ?? null,
    sexual: image.sexual ?? 0,
    violence: image.violence ?? 0,
  };
}

export function resolveVnName(vn: RawVn): EntityName {
  const titles = vn.titles ?? [];
  const simplified = titles.find((item) => item.lang === "zh-Hans")?.title;
  const traditional = titles.find((item) => item.lang === "zh-Hant")?.title;
  const originalTitle =
    vn.alttitle ?? titles.find((item) => item.main)?.title ?? vn.title;
  const primary = simplified ?? traditional ?? originalTitle ?? vn.title;
  const romanized = primary === vn.title ? null : vn.title;
  const original =
    originalTitle !== primary && originalTitle !== romanized ? originalTitle : null;

  return {
    primary,
    original,
    romanized,
    alternatives: unique([
      ...titles.flatMap((item) => [item.title, item.latin]),
      ...(vn.aliases ?? []),
    ]).filter((item) => ![primary, originalTitle, romanized].includes(item)),
  };
}

export function resolvePersonName(
  item: RawCharacter | RawStaff,
): EntityName {
  const aliasValues = (item.aliases ?? []).flatMap((alias) =>
    typeof alias === "string" ? [alias] : [alias.name, alias.latin],
  );
  const primary = item.original ?? item.name;
  return {
    primary,
    original: item.original && item.original !== primary ? item.original : null,
    romanized: item.name === primary ? null : item.name,
    alternatives: unique(aliasValues).filter(
      (value) => ![primary, item.name, item.original].includes(value),
    ),
  };
}

export function mapVnSummary(vn: RawVn): EntitySummary {
  return {
    id: vn.id,
    type: "vn",
    name: resolveVnName(vn),
    image: mapImage(vn.image),
  };
}

export function mapCharacterSummary(character: RawCharacter): EntitySummary {
  return {
    id: character.id,
    type: "character",
    name: resolvePersonName(character),
    image: mapImage(character.image),
  };
}

export function mapStaffSummary(staff: RawStaff): EntitySummary {
  return {
    id: staff.id,
    type: "staff",
    name: resolvePersonName(staff),
    image: null,
  };
}

export function mapTagSummary(tag: RawTag): EntitySummary {
  return {
    id: tag.id,
    type: "tag",
    name: {
      primary: tag.name,
      original: null,
      romanized: null,
      alternatives: unique(tag.aliases ?? []).filter((value) => value !== tag.name),
    },
    image: null,
  };
}

export function cleanVndbText(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .replace(/\[url=[^\]]+\]([^[]*)\[\/url\]/gi, "$1")
    .replace(/\[url\]([^[]*)\[\/url\]/gi, "$1")
    .replace(/\[\/?(?:b|i|u|s|spoiler|quote|raw)(?:=[^\]]+)?\]/gi, "")
    .trim();
}

export const fields = {
  vnSummary:
    "title,alttitle,titles{lang,title,latin,main},aliases,image{url,thumbnail,sexual,violence}",
  characterSummary: "name,original,aliases,image{url,sexual,violence}",
  staffSummary: "name,original,aliases{name,latin,ismain}",
  tagSummary: "name,aliases,category,vn_count",
} as const;
