import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { entityPath, type EntitySummary } from "./api";

export type TrailItem = { entity: EntitySummary; path: string };

export function isEntitySummary(value: unknown): value is EntitySummary {
  if (!value || typeof value !== "object") return false;
  const entity = value as Partial<EntitySummary>;
  return typeof entity.id === "string"
    && (entity.type === "vn" || entity.type === "character" || entity.type === "staff" || entity.type === "tag")
    && Boolean(entity.name)
    && typeof entity.name?.primary === "string";
}

export function normalizeTrail(value: unknown): TrailItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    if ("entity" in item && "path" in item && typeof item.path === "string" && isEntitySummary(item.entity)) return [item as TrailItem];
    if (isEntitySummary(item)) {
      const entity = item as EntitySummary;
      return [{ entity, path: entityPath(entity) }];
    }
    return [];
  }).slice(-12);
}

export function addTrailItem(current: TrailItem[], entity: EntitySummary, path: string = entityPath(entity)): TrailItem[] {
  return [...current.filter((item) => item.path !== path), { entity, path }].slice(-12);
}

type TrailContextValue = {
  items: TrailItem[];
  visit: (entity: EntitySummary, path?: string) => void;
  clear: () => void;
};

const TrailContext = createContext<TrailContextValue | null>(null);
const STORAGE_KEY = "gal-toolbox-exploration-trail-v1";

function initialTrail(): TrailItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? normalizeTrail(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function TrailProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<TrailItem[]>(initialTrail);

  const visit = useCallback(
    (entity: EntitySummary, path?: string) => {
      setItems((current) => {
        const next = addTrailItem(current, entity, path);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const clear = useCallback(() => {
    setItems([]);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);
  const value = useMemo(() => ({ items, visit, clear }), [items, visit, clear]);
  return <TrailContext.Provider value={value}>{children}</TrailContext.Provider>;
}

export function useTrail() {
  const value = useContext(TrailContext);
  if (!value) throw new Error("useTrail must be used inside TrailProvider");
  return value;
}

export function ExplorationTrail() {
  const { items, clear } = useTrail();
  return (
    <aside className="exploration-trail" aria-label="探索轨迹">
      <div className="trail-heading">
        <div>
          <span>Exploration trail</span>
          <h2>探索轨迹</h2>
        </div>
        {items.length ? <button type="button" onClick={clear}>清空</button> : null}
      </div>
      {items.length ? (
        <ol>
          {items.map((item, index) => (
            <li key={item.path}>
              {index > 0 ? <span className="trail-arrow" aria-hidden="true">→</span> : null}
              <Link to={item.path} title={item.entity.name.primary}>
                {item.entity.image ? (
                  <img src={item.entity.image.thumbnailUrl ?? item.entity.image.url} alt="" />
                ) : (
                  <span className="trail-fallback">{item.entity.type === "tag" ? "#" : item.entity.name.primary.slice(0, 1)}</span>
                )}
                <strong>{item.entity.name.primary}</strong>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="trail-empty">打开作品、角色、声优或画师后，路径会在这里连起来。</p>
      )}
    </aside>
  );
}
