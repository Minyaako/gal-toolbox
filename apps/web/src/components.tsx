import { useQueryClient } from "@tanstack/react-query";
import type { FocusEventHandler, PointerEventHandler, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  entityPath,
  type EntityImage as EntityImageType,
  type EntitySummary,
  type EntityType,
} from "./api";
import { advanceIntersectionLatch } from "./buffered-pages";
import { useSettings, type PrefetchPreference } from "./app/settings";
import { prefetchEntity } from "./queries";

const labels: Record<EntityType, string> = {
  vn: "作品",
  character: "角色",
  staff: "声优 / 制作人员",
  tag: "Tag",
};

type ImageStatus = "loading" | "loaded" | "error";
type ImageLoadState = { source: string | null; status: ImageStatus };

export function imagePresentation(image: EntityImageType, alt: string): {
  kind: "image" | "fallback";
  alt: string;
  fallbackText: string;
} {
  return {
    kind: image ? "image" : "fallback",
    alt,
    fallbackText: alt.trim().slice(0, 1) || "?",
  };
}

export function imageLoadStatus(
  state: ImageLoadState,
  resolvedSource: string | null,
): ImageStatus {
  return state.source === resolvedSource ? state.status : "loading";
}

export function EntityImage({
  image,
  alt,
  className = "",
  fallbackText,
  eager = false,
}: {
  image: EntityImageType;
  alt: string;
  className?: string;
  fallbackText?: string;
  eager?: boolean;
}) {
  const { settings } = useSettings();
  const [revealedSource, setRevealedSource] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<ImageLoadState>({
    source: null,
    status: "loading",
  });
  const sensitive = Boolean(image && (image.sexual >= 1 || image.violence >= 1));
  const eagerBrowserLoad = eager && settings.imageQuality !== "data-saver";
  const source = (settings.imageQuality === "high"
    ? image?.url
    : image?.thumbnailUrl ?? image?.url) ?? null;
  const status = imageLoadStatus(loadState, source);
  const presentation = imagePresentation(status === "error" ? null : image, alt);
  const revealed = revealedSource === source;

  if (presentation.kind === "fallback" || !source) {
    return (
      <div className={`entity-image image-fallback ${className}`} aria-label={`${presentation.alt} 暂无图片`}>
        <span>{fallbackText ?? presentation.fallbackText}</span>
      </div>
    );
  }

  return (
    <div className={`image-frame ${status === "loaded" ? "is-loaded" : "is-loading"} ${className}`} aria-busy={status === "loading"}>
      <span className="image-loading-skeleton" aria-hidden="true" />
      <img
        className={`entity-image ${sensitive && !revealed ? "is-sensitive" : ""}`}
        src={source}
        alt={alt}
        loading={eagerBrowserLoad ? "eager" : "lazy"}
        fetchPriority={eagerBrowserLoad ? "high" : "auto"}
        decoding="async"
        onLoad={() => setLoadState({ source, status: "loaded" })}
        onError={() => setLoadState({ source, status: "error" })}
      />
      {sensitive && !revealed ? (
        <button className="reveal-image" type="button" onClick={() => setRevealedSource(source)}>
          显示分级图片
        </button>
      ) : null}
    </div>
  );
}

export function NameBlock({
  entity,
  compact = false,
  headingLevel = 2,
}: {
  entity: EntitySummary;
  compact?: boolean;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <div className={`name-block ${compact ? "is-compact" : ""}`}>
      <span className="entity-kind">{labels[entity.type]}</span>
      <Heading>{entity.name.primary}</Heading>
      {entity.name.original ? <p>{entity.name.original}</p> : null}
      {entity.name.romanized ? <p lang="ja-Latn">{entity.name.romanized}</p> : null}
    </div>
  );
}

export function EntityCard({
  entity,
  meta,
}: {
  entity: EntitySummary;
  meta?: ReactNode;
}) {
  return (
    <article className={`entity-card entity-${entity.type}`}>
      <EntityPrefetchLink
        entity={entity}
        className="card-link"
        aria-label={`打开${labels[entity.type]}：${entity.name.primary}`}
      >
        <EntityImage
          image={entity.image}
          alt={entity.name.primary}
          fallbackText={entity.type === "tag" ? "#" : undefined}
        />
        <div className="card-copy">
          <NameBlock entity={entity} compact />
          {meta ? <div className="card-meta">{meta}</div> : null}
        </div>
      </EntityPrefetchLink>
    </article>
  );
}

type EntityPrefetchHandlers = {
  onPointerEnter?: PointerEventHandler<HTMLAnchorElement>;
  onFocus?: FocusEventHandler<HTMLAnchorElement>;
  onPointerDown: PointerEventHandler<HTMLAnchorElement>;
};

export function entityPrefetchHandlers(
  preference: PrefetchPreference,
  prefetch: () => void,
): EntityPrefetchHandlers {
  const prefetchOnIntent = preference === "data-saver" ? undefined : prefetch;
  return {
    onPointerEnter: prefetchOnIntent,
    onFocus: prefetchOnIntent,
    onPointerDown: prefetch,
  };
}

export function EntityPrefetchLink({
  entity,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  entity: EntitySummary;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const prefetch = useCallback(() => {
    void prefetchEntity(queryClient, entity);
  }, [entity, queryClient]);

  useEffect(() => {
    if (settings.prefetch === "aggressive") prefetch();
  }, [prefetch, settings.prefetch]);

  return <Link
    to={entityPath(entity)}
    className={className}
    aria-label={ariaLabel}
    {...entityPrefetchHandlers(settings.prefetch, prefetch)}
  >{children}</Link>;
}

export function StatePanel({
  title,
  children,
  tone = "neutral",
  headingLevel = 2,
}: {
  title: string;
  children?: ReactNode;
  tone?: "neutral" | "error";
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <section className={`state-panel state-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="state-mark" aria-hidden="true">{tone === "error" ? "!" : "·"}</span>
      <div>
        <Heading>{title}</Heading>
        {children}
      </div>
    </section>
  );
}

export function SectionHeading({ index, title, note }: { index: string; title: string; note?: string }) {
  return (
    <div className="section-heading">
      <span>{index}</span>
      <div>
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </div>
    </div>
  );
}

export function LoadingGrid() {
  return (
    <div className="entity-grid" aria-label="正在加载">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="skeleton-card" key={index} aria-hidden="true">
          <span />
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}

export function LoadingScene({
  title = "正在调取资料",
  note = "先整理关系，再打开资料抽屉。",
  compact = false,
  headingLevel = 2,
}: {
  title?: string;
  note?: string;
  compact?: boolean;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <section className={`loading-scene ${compact ? "is-compact" : ""}`} role="status" aria-live="polite" aria-busy="true">
      <div className="loading-cabinet" aria-hidden="true">
        <span /><span /><span />
        <i>VNDB</i>
      </div>
      <div className="loading-copy">
        <span>Association archive / loading</span>
        <Heading>{title}</Heading>
        <p>{note}</p>
      </div>
    </section>
  );
}

export function AutoPageLoader({
  hasNextPage,
  isFetching,
  buffered = false,
  onLoad,
  label = "继续加载",
}: {
  hasNextPage: boolean;
  isFetching: boolean;
  buffered?: boolean;
  onLoad: () => void;
  label?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const autoLoadArmedRef = useRef(true);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasNextPage || isFetching) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const next = advanceIntersectionLatch(
          autoLoadArmedRef.current,
          entry.isIntersecting,
        );
        autoLoadArmedRef.current = next.armed;
        if (next.shouldLoad) onLoad();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetching, onLoad]);

  if (!hasNextPage) return null;
  return (
    <div className={`auto-page-loader ${isFetching ? "is-fetching" : ""} ${buffered ? "is-buffered" : ""}`} ref={sentinelRef}>
      <span aria-hidden="true"><i /><i /><i /></span>
      <button type="button" disabled={isFetching} onClick={onLoad}>
        {isFetching ? "正在准备下一页…" : label}
      </button>
    </div>
  );
}
