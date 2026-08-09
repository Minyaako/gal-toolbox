import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  entityPath,
  type EntityImage as EntityImageType,
  type EntitySummary,
  type EntityType,
} from "./api";

const labels: Record<EntityType, string> = {
  vn: "作品",
  character: "角色",
  staff: "声优 / 制作人员",
};

export function EntityImage({
  image,
  alt,
  className = "",
}: {
  image: EntityImageType;
  alt: string;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const sensitive = Boolean(image && (image.sexual >= 1 || image.violence >= 1));

  if (!image) {
    return (
      <div className={`entity-image image-fallback ${className}`} aria-label={`${alt} 暂无图片`}>
        <span>{alt.slice(0, 1)}</span>
      </div>
    );
  }

  return (
    <div className={`image-frame ${className}`}>
      <img
        className={`entity-image ${sensitive && !revealed ? "is-sensitive" : ""}`}
        src={image.thumbnailUrl ?? image.url}
        alt={alt}
        loading="lazy"
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
  return (
    <article className={`entity-card entity-${entity.type}`}>
      <Link to={entityPath(entity)} className="card-link" aria-label={`打开${labels[entity.type]}：${entity.name.primary}`}>
        <EntityImage image={entity.image} alt={entity.name.primary} />
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

