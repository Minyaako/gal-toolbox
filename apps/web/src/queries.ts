import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query";
import {
  getCharacter,
  getStaff,
  getStaffCharacters,
  getTag,
  getTagVns,
  getVn,
  type CharacterDetail,
  type EntityImage,
  type EntitySummary,
  type Page,
  type StaffCharacter,
  type TagDetail,
  type VnDetail,
} from "./api";

export const vnQuery = (id: string) =>
  queryOptions({ queryKey: ["vn", id], queryFn: () => getVn(id) });

export const characterQuery = (id: string) =>
  queryOptions({
    queryKey: ["character", id],
    queryFn: () => getCharacter(id),
  });

export const staffQuery = (id: string) =>
  queryOptions({ queryKey: ["staff", id], queryFn: () => getStaff(id) });

export const staffCharactersQuery = (id: string) =>
  infiniteQueryOptions({
    queryKey: ["staff-characters", id],
    queryFn: ({ pageParam }) => getStaffCharacters(id, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.more ? lastPage.page + 1 : undefined,
  });

export const tagQuery = (id: string) =>
  queryOptions({ queryKey: ["tag", id], queryFn: () => getTag(id) });

export const tagVnsQuery = (id: string) =>
  infiniteQueryOptions({
    queryKey: ["tag-vns", id],
    queryFn: ({ pageParam }) => getTagVns(id, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.more ? lastPage.page + 1 : undefined,
  });

export type QueryCacheSummary = {
  total: number;
  active: number;
  fetching: number;
  failed: number;
};

export function queryCacheSummary(queryClient: QueryClient): QueryCacheSummary {
  const queries = queryClient.getQueryCache().getAll();
  return {
    total: queries.length,
    active: queries.filter((query) => query.getObserversCount() > 0).length,
    fetching: queries.filter((query) => query.state.fetchStatus === "fetching").length,
    failed: queries.filter((query) => query.state.status === "error").length,
  };
}

const imageUrl = (image: EntityImage) =>
  image ? (image.thumbnailUrl ?? image.url) : null;

const preloadBrowserImage = (url: string) => {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
};

const preloadImages = (
  urls: Array<string | null>,
  preload: (url: string) => void,
) => {
  for (const url of new Set(urls.filter((value): value is string => Boolean(value)))) {
    preload(url);
  }
};

export async function prefetchEntity(
  queryClient: QueryClient,
  entity: EntitySummary,
  preload: (url: string) => void = preloadBrowserImage,
): Promise<void> {
  try {
    if (entity.type === "vn") {
      await queryClient.prefetchQuery(vnQuery(entity.id));
      const detail = queryClient.getQueryData<VnDetail>(["vn", entity.id]);
      if (detail) {
        preloadImages(
          [
            imageUrl(detail.entity.image),
            ...detail.cast.map(({ character }) => imageUrl(character.image)),
          ],
          preload,
        );
      }
      return;
    }

    if (entity.type === "character") {
      await queryClient.prefetchQuery(characterQuery(entity.id));
      const detail = queryClient.getQueryData<CharacterDetail>([
        "character",
        entity.id,
      ]);
      if (detail) preloadImages([imageUrl(detail.entity.image)], preload);
      return;
    }

    if (entity.type === "staff") {
      await Promise.all([
        queryClient.prefetchQuery(staffQuery(entity.id)),
        queryClient.prefetchInfiniteQuery(staffCharactersQuery(entity.id)),
      ]);
      const roles = queryClient.getQueryData<{
        pages: Array<Page<StaffCharacter>>;
      }>(["staff-characters", entity.id]);
      preloadImages(
        roles?.pages.flatMap((page) =>
          page.items.map(({ character }) => imageUrl(character.image)),
        ) ?? [],
        preload,
      );
      return;
    }

    await Promise.all([
      queryClient.prefetchQuery(tagQuery(entity.id)),
      queryClient.prefetchInfiniteQuery(tagVnsQuery(entity.id)),
    ]);
    const detail = queryClient.getQueryData<TagDetail>(["tag", entity.id]);
    const novels = queryClient.getQueryData<{ pages: Array<Page<EntitySummary>> }>(
      ["tag-vns", entity.id],
    );
    preloadImages(
      [
        imageUrl(detail?.entity.image ?? null),
        ...(novels?.pages.flatMap((page) =>
          page.items.map((novel) => imageUrl(novel.image)),
        ) ?? []),
      ],
      preload,
    );
  } catch {
    // Intent prefetch is opportunistic; route-level queries own visible errors.
  }
}
