import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query";
import {
  getArtist,
  getArtistVns,
  getCharacter,
  getSearchPage,
  getStaff,
  getStaffCharacters,
  getTag,
  getTagVns,
  getVn,
  type EntityType,
  type CharacterDetail,
  type ArtistWork,
  type EntityImage,
  type EntitySummary,
  type Page,
  type StaffCharacter,
  type TagDetail,
  type VnDetail,
  type RequestPriority,
} from "./api";

export const vnQuery = (id: string, priority: RequestPriority = "high") =>
  queryOptions({ queryKey: ["vn", id], queryFn: ({ signal }) => getVn(id, { signal, priority }) });

export const characterQuery = (id: string, priority: RequestPriority = "high") =>
  queryOptions({
    queryKey: ["character", id],
    queryFn: ({ signal }) => getCharacter(id, { signal, priority }),
  });

export const staffQuery = (id: string, priority: RequestPriority = "high") =>
  queryOptions({ queryKey: ["staff", id], queryFn: ({ signal }) => getStaff(id, { signal, priority }) });

export const staffCharactersQuery = (
  id: string,
  getPriority: () => RequestPriority = () => "normal",
) =>
  infiniteQueryOptions({
    queryKey: ["staff-characters", id],
    queryFn: ({ pageParam, signal }) => getStaffCharacters(id, pageParam, 12, { signal, priority: getPriority() }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.more ? lastPage.page + 1 : undefined,
  });

export const tagQuery = (id: string, priority: RequestPriority = "high") =>
  queryOptions({ queryKey: ["tag", id], queryFn: ({ signal }) => getTag(id, { signal, priority }) });

export const tagVnsQuery = (
  id: string,
  getPriority: () => RequestPriority = () => "normal",
) =>
  infiniteQueryOptions({
    queryKey: ["tag-vns", id],
    queryFn: ({ pageParam, signal }) => getTagVns(id, pageParam, 12, { signal, priority: getPriority() }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.more ? lastPage.page + 1 : undefined,
  });

export const artistQuery = (id: string, priority: RequestPriority = "high") =>
  queryOptions({ queryKey: ["artist", id], queryFn: ({ signal }) => getArtist(id, { signal, priority }) });

export const artistVnsQuery = (
  id: string,
  getPriority: () => RequestPriority = () => "normal",
) =>
  infiniteQueryOptions({
    queryKey: ["artist-vns", id],
    queryFn: ({ pageParam, signal }) => getArtistVns(id, pageParam, 12, { signal, priority: getPriority() }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.more ? lastPage.page + 1 : undefined,
  });

export const searchQuery = (
  type: EntityType,
  query: string,
  getPriority: () => RequestPriority = () => "high",
) => infiniteQueryOptions({
  queryKey: ["search", type, query],
  queryFn: ({ pageParam, signal }) => getSearchPage(type, query, pageParam, 12, {
    signal,
    priority: pageParam === 1 ? "high" : getPriority(),
  }),
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.more ? lastPage.page + 1 : undefined,
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

const activeIntentPrefetches = new WeakMap<QueryClient, Set<string>>();
const MAX_ACTIVE_INTENT_PREFETCHES = 3;

export async function promoteArtist(id: string): Promise<void> {
  try {
    const options = { priority: "high" as const, promotion: true };
    await Promise.all([getArtist(id, options), getArtistVns(id, 1, 12, options)]);
  } catch {
    // The route queries remain the owner of visible success and error state.
  }
}

export async function prefetchArtist(
  queryClient: QueryClient,
  staff: EntitySummary,
  preload: (url: string) => void = preloadBrowserImage,
): Promise<void> {
  let active = activeIntentPrefetches.get(queryClient);
  if (!active) {
    active = new Set();
    activeIntentPrefetches.set(queryClient, active);
  }
  const intentKey = `artist:${staff.id}`;
  const ownsSlot = !active.has(intentKey);
  if (ownsSlot && active.size >= MAX_ACTIVE_INTENT_PREFETCHES) return;
  if (ownsSlot) active.add(intentKey);

  try {
    await Promise.all([
      queryClient.prefetchQuery(artistQuery(staff.id, "low")),
      queryClient.prefetchInfiniteQuery(artistVnsQuery(staff.id, () => "low")),
    ]);
    const works = queryClient.getQueryData<{ pages: Array<Page<ArtistWork>> }>(["artist-vns", staff.id]);
    preloadImages(
      works?.pages.flatMap((page) => page.items.map(({ vn }) => imageUrl(vn.image))) ?? [],
      preload,
    );
  } catch {
    // Intent prefetch is opportunistic; route-level queries own visible errors.
  } finally {
    if (ownsSlot) active.delete(intentKey);
  }
}

export async function promoteEntity(entity: EntitySummary): Promise<void> {
  try {
    const options = { priority: "high" as const, promotion: true };
    if (entity.type === "vn") await getVn(entity.id, options);
    else if (entity.type === "character") await getCharacter(entity.id, options);
    else if (entity.type === "staff") await getStaff(entity.id, options);
    else await getTag(entity.id, options);
  } catch {
    // The route query remains the owner of visible success and error state.
  }
}

export async function prefetchEntity(
  queryClient: QueryClient,
  entity: EntitySummary,
  preload: (url: string) => void = preloadBrowserImage,
): Promise<void> {
  let active = activeIntentPrefetches.get(queryClient);
  if (!active) {
    active = new Set();
    activeIntentPrefetches.set(queryClient, active);
  }
  const intentKey = `${entity.type}:${entity.id}`;
  const ownsSlot = !active.has(intentKey);
  if (ownsSlot && active.size >= MAX_ACTIVE_INTENT_PREFETCHES) return;
  if (ownsSlot) active.add(intentKey);

  try {
    if (entity.type === "vn") {
      await queryClient.prefetchQuery(vnQuery(entity.id, "low"));
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
      await queryClient.prefetchQuery(characterQuery(entity.id, "low"));
      const detail = queryClient.getQueryData<CharacterDetail>([
        "character",
        entity.id,
      ]);
      if (detail) preloadImages([imageUrl(detail.entity.image)], preload);
      return;
    }

    if (entity.type === "staff") {
      await Promise.all([
        queryClient.prefetchQuery(staffQuery(entity.id, "low")),
        queryClient.prefetchInfiniteQuery(staffCharactersQuery(entity.id, () => "low")),
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
      queryClient.prefetchQuery(tagQuery(entity.id, "low")),
      queryClient.prefetchInfiniteQuery(tagVnsQuery(entity.id, () => "low")),
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
  } finally {
    if (ownsSlot) active.delete(intentKey);
  }
}
