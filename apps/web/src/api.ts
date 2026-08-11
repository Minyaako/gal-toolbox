export type EntityType = "vn" | "character" | "staff" | "tag";
export type RequestPriority = "high" | "normal" | "low";

export type ApiRequestOptions = {
  signal?: AbortSignal;
  priority?: RequestPriority;
};

export type EntityName = {
  primary: string;
  original: string | null;
  romanized: string | null;
  alternatives: string[];
};

export type EntityImage = {
  url: string;
  thumbnailUrl: string | null;
  sexual: number;
  violence: number;
} | null;

export type EntitySummary = {
  id: string;
  type: EntityType;
  name: EntityName;
  image: EntityImage;
};

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  more: boolean;
};

export type VnDetail = {
  entity: EntitySummary;
  description: string | null;
  released: string | null;
  rating: number | null;
  voteCount: number;
  relations: Array<{ entity: EntitySummary; relation: string }>;
  cast: Array<{
    character: EntitySummary;
    staff: EntitySummary;
    note: string | null;
  }>;
  tags: Array<{
    tag: EntitySummary;
    rating: number;
    spoiler: number;
    category: "cont" | "ero" | "tech" | null;
  }>;
};

export type CharacterDetail = {
  entity: EntitySummary;
  description: string | null;
  appearances: Array<{
    vn: EntitySummary;
    role: "main" | "primary" | "side" | "appears";
  }>;
};

export type StaffDetail = {
  entity: EntitySummary;
  description: string | null;
  language: string | null;
  aliases: Array<{ name: string; latin: string | null; ismain: boolean }>;
  externalLinks: Array<{ url: string; label: string }>;
};

export type StaffCharacter = {
  character: EntitySummary;
  appearances: CharacterDetail["appearances"];
};

export type TagDetail = {
  entity: EntitySummary;
  description: string | null;
  category: "cont" | "ero" | "tech" | null;
  vnCount: number;
};

type ApiErrorBody = {
  error?: { code?: string; message?: string; requestId?: string };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    signal: options.signal,
    headers: {
      Accept: "application/json",
      "X-Request-Priority": options.priority ?? "normal",
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(
      body.error?.message ?? "请求失败，请稍后重试。",
      response.status,
      body.error?.code ?? "UNKNOWN",
      body.error?.requestId,
    );
  }
  return response.json() as Promise<T>;
}

export const getSearchPage = (
  type: EntityType,
  query: string,
  page: number,
  pageSize = 12,
  options: ApiRequestOptions = {},
) =>
  api<Page<EntitySummary>>(
    `/search?type=${type}&q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`,
    options,
  );

export const getVn = (id: string, options: ApiRequestOptions = {}) => api<VnDetail>(`/vns/${id}`, options);
export const getCharacter = (id: string, options: ApiRequestOptions = {}) =>
  api<CharacterDetail>(`/characters/${id}`, options);
export const getStaff = (id: string, options: ApiRequestOptions = {}) => api<StaffDetail>(`/staff/${id}`, options);
export const getStaffCharacters = (id: string, page: number, pageSize = 12, options: ApiRequestOptions = {}) =>
  api<Page<StaffCharacter>>(
    `/staff/${id}/characters?page=${page}&pageSize=${pageSize}`,
    options,
  );
export const getTag = (id: string, options: ApiRequestOptions = {}) => api<TagDetail>(`/tags/${id}`, options);
export const getTagVns = (id: string, page: number, pageSize = 12, options: ApiRequestOptions = {}) =>
  api<Page<EntitySummary>>(`/tags/${id}/vns?page=${page}&pageSize=${pageSize}`, options);

export function entityPath(entity: Pick<EntitySummary, "id" | "type">): string {
  return knowledgeEntityPath(entity);
}
import { knowledgeEntityPath } from "./app/navigation";
