export type EntityType = "vn" | "character" | "staff" | "tag";

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

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    headers: { Accept: "application/json" },
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
) =>
  api<Page<EntitySummary>>(
    `/search?type=${type}&q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`,
  );

export const getVn = (id: string) => api<VnDetail>(`/vns/${id}`);
export const getCharacter = (id: string) =>
  api<CharacterDetail>(`/characters/${id}`);
export const getStaff = (id: string) => api<StaffDetail>(`/staff/${id}`);
export const getStaffCharacters = (id: string, page: number, pageSize = 12) =>
  api<Page<StaffCharacter>>(
    `/staff/${id}/characters?page=${page}&pageSize=${pageSize}`,
  );
export const getTag = (id: string) => api<TagDetail>(`/tags/${id}`);
export const getTagVns = (id: string, page: number, pageSize = 12) =>
  api<Page<EntitySummary>>(`/tags/${id}/vns?page=${page}&pageSize=${pageSize}`);

export function entityPath(entity: Pick<EntitySummary, "id" | "type">): string {
  if (entity.type === "vn") return `/vn/${entity.id}`;
  if (entity.type === "character") return `/character/${entity.id}`;
  if (entity.type === "staff") return `/staff/${entity.id}`;
  return `/tag/${entity.id}`;
}
