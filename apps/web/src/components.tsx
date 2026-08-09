import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  entityPath,
  type EntityImage as EntityImageType,
  type EntitySummary,
  type EntityType,
} from "./api";
import { advanceIntersectionLatch } from "./buffered-pages";
import { prefetchEntity } from "./queries";

const labels: Record<EntityType, string> = {
  vn: "作品",
  character: "角色",
  staff: "声优 / 制作人员",
  tag: "Tag",
};

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
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const sensitive = Boolean(image && (image.sexual >= 1 || image.violence >= 1));

  useEffect(() => {
    setStatus("loading");
    setRevealed(false);
  }, [image?.url]);

  if (!image || status === "error") {
    return (
      <div className={`entity-image image-fallback ${className}`} aria-label={`${alt} 暂无图片`}>
        <span>{fallbackText ?? alt.slice(0, 1)}</span>
      </div>
    );
  }

  return (
    <div className={`image-frame ${status === "loaded" ? "is-loaded" : "is-loading"} ${className}`} aria-busy={status === "loading"}>
      <span className="image-loading-skeleton" aria-hidden="true" />
      <img
        className={`entity-image ${sensitive && !revealed ? "is-sensitive" : ""}`}
        src={image.thumbnailUrl ?? image.url}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        decoding="async"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
      />
      {sensitive && !revealed ? (
        <button className="reveal-image" type="button" onClick={() => setRevealed(true)}>
          显示分级图片
        </button>
      ) : null}
    </div>
  );
}

export function NameBlock({ entity, compact = false }: { entity: EntitySummary; compact?: boolean }) {
  return (
    <div className={`name-block ${compact ? "is-compact" : ""}`}>
      <span className="entity-kind">{labels[entity.type]}</span>
      <h2>{entity.name.primary}</h2>
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
  const queryClient = useQueryClient();
  const prefetch = () => {
    void prefetchEntity(queryClient, entity);
  };

  return (
    <article className={`entity-card entity-${entity.type}`}>
      <Link
        to={entityPath(entity)}
        className="card-link"
        aria-label={`打开${labels[entity.type]}：${entity.name.primary}`}
        onPointerEnter={prefetch}
        onFocus={prefetch}
        onPointerDown={prefetch}
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
      </Link>
    </article>
  );
}

export function StatePanel({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children?: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <section className={`state-panel state-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="state-mark" aria-hidden="true">{tone === "error" ? "!" : "·"}</span>
      <div>
        <h2>{title}</h2>
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
}: {
  title?: string;
  note?: string;
  compact?: boolean;
}) {
  return (
    <section className={`loading-scene ${compact ? "is-compact" : ""}`} role="status" aria-live="polite" aria-busy="true">
      <div className="loading-cabinet" aria-hidden="true">
        <span /><span /><span />
        <i>VNDB</i>
      </div>
      <div className="loading-copy">
        <span>Association archive / loading</span>
        <h2>{title}</h2>
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
