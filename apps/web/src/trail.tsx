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

type TrailContextValue = {
  items: EntitySummary[];
  visit: (entity: EntitySummary) => void;
  clear: () => void;
};

const TrailContext = createContext<TrailContextValue | null>(null);
const STORAGE_KEY = "gal-toolbox-exploration-trail-v1";

function initialTrail(): EntitySummary[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EntitySummary[]) : [];
  } catch {
    return [];
  }
}

export function TrailProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<EntitySummary[]>(initialTrail);

  const visit = useCallback(
    (entity: EntitySummary) => {
      setItems((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== entity.id);
        const next = [...withoutDuplicate, entity].slice(-12);
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
          {items.map((entity, index) => (
            <li key={entity.id}>
              {index > 0 ? <span className="trail-arrow" aria-hidden="true">→</span> : null}
              <Link to={entityPath(entity)} title={entity.name.primary}>
                {entity.image ? (
                  <img src={entity.image.thumbnailUrl ?? entity.image.url} alt="" />
                ) : (
                  <span className="trail-fallback">{entity.name.primary.slice(0, 1)}</span>
                )}
                <strong>{entity.name.primary}</strong>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="trail-empty">打开作品、角色或声优后，路径会在这里连起来。</p>
      )}
    </aside>
  );
}
