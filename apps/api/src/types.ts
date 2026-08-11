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

export type ArtistRole = "art" | "chardesign";

export type ArtistCredit = {
  role: ArtistRole;
  note: string | null;
};

export type ArtistRelation = {
  staff: EntitySummary;
  credits: ArtistCredit[];
};

export type ArtistWork = {
  vn: EntitySummary;
  credits: ArtistCredit[];
};

export type CacheStatus = "HIT" | "MISS" | "STALE";
