import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSettings, type MotionPreference } from "./settings";

export type TransitionState = "idle" | "covering" | "revealing";
export type TransitionAction =
  | { type: "start" }
  | { type: "finish" }
  | { type: "settled" }
  | { type: "failed" };

export function reduceTransition(
  state: TransitionState,
  action: TransitionAction,
): TransitionState {
  if (action.type === "start") return "covering";
  if (action.type === "settled") return "idle";
  if (action.type === "finish") {
    return state === "covering" ? "revealing" : state;
  }
  if (state === "covering") return "revealing";
  if (state === "revealing") return "idle";
  return "idle";
}

export type TransitionTiming = {
  coverMs: number;
  revealMs: number;
  layerDelayMs: number;
};

export function transitionTiming(motion: MotionPreference): TransitionTiming {
  if (motion === "full") {
    return { coverMs: 250, revealMs: 250, layerDelayMs: 70 };
  }
  if (motion === "reduced") {
    return { coverMs: 60, revealMs: 60, layerDelayMs: 0 };
  }
  return { coverMs: 0, revealMs: 0, layerDelayMs: 0 };
}

export function routeLoadingLabel(pathname: string) {
  if (/^\/knowledge\/vn\//.test(pathname)) return "正在准备作品资料";
  if (/^\/knowledge\/character\//.test(pathname)) return "正在准备角色资料";
  if (/^\/knowledge\/staff\//.test(pathname)) return "正在准备声优资料";
  if (/^\/knowledge\/tag\//.test(pathname)) return "正在准备 Tag 资料";
  if (pathname === "/knowledge") return "正在打开 Gal 联想图鉴";
  if (pathname === "/ranking") return "正在打开 Gal 排行";
  if (pathname === "/settings") return "正在打开设置";
  return "正在打开页面";
}

function routeQueryKey(pathname: string): readonly [string, string] | null {
  const match = pathname.match(/^\/knowledge\/(vn|character|staff|tag)\/([^/]+)/);
  if (!match?.[1] || !match[2]) return null;
  return [match[1], decodeURIComponent(match[2])];
}

function targetIsFetching(queryClient: QueryClient, pathname: string) {
  const queryKey = routeQueryKey(pathname);
  return queryKey ? queryClient.isFetching({ queryKey, exact: true }) > 0 : false;
}

const loadingFallbackMs = 10_000;

type TransitionStyles = CSSProperties & Record<`--${string}`, string>;

function curtainStyle(
  layer: "rose" | "cyan",
  state: TransitionState,
  motion: MotionPreference,
  timing: TransitionTiming,
): CSSProperties {
  if (motion !== "full") return {};
  const transform = state === "covering"
    ? "translateX(0) skewX(-10deg)"
    : state === "revealing"
      ? "translateX(-125%) skewX(-10deg)"
      : "translateX(125%) skewX(-10deg)";
  const delayedCover = layer === "cyan" && state === "covering";
  const duration = delayedCover
    ? Math.max(0, timing.coverMs - timing.layerDelayMs)
    : state === "covering"
      ? timing.coverMs
      : timing.revealMs;
  return {
    position: "absolute",
    inset: "-16%",
    background: layer === "rose" ? "#b63f67" : "#41b8c4",
    transform,
    transitionProperty: "transform",
    transitionDuration: `${duration}ms`,
    transitionDelay: `${delayedCover ? timing.layerDelayMs : 0}ms`,
    transitionTimingFunction: "cubic-bezier(0.65, 0, 0.35, 1)",
    willChange: "transform",
  };
}

export function RouteTransition({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { motion } = useSettings();
  const timing = useMemo(() => transitionTiming(motion), [motion]);
  const [state, dispatch] = useReducer(reduceTransition, "idle");
  const [status, setStatus] = useState("");
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const stateRef = useRef<TransitionState>("idle");
  const destinationRef = useRef(location.pathname);
  const previousLocationKeyRef = useRef(location.key);
  const selfNavigationRef = useRef(false);
  const generationRef = useRef(0);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const setTransitionState = useCallback((action: TransitionAction) => {
    stateRef.current = reduceTransition(stateRef.current, action);
    dispatch(action);
  }, []);

  const clearAsyncWork = useCallback(() => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current.clear();
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delay);
    timersRef.current.add(timer);
  }, []);

  const reveal = useCallback((generation: number, failed = false) => {
    if (generation !== generationRef.current) return;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setTransitionState({ type: failed ? "failed" : "finish" });
    schedule(() => {
      if (generation !== generationRef.current) return;
      setTransitionState({ type: "settled" });
      setStatus("");
    }, timing.revealMs);
  }, [schedule, setTransitionState, timing.revealMs]);

  const waitForTarget = useCallback((pathname: string, generation: number) => {
    schedule(() => {
      if (generation !== generationRef.current) return;
      const check = () => {
        if (generation !== generationRef.current) return;
        if (!targetIsFetching(queryClient, pathname)) reveal(generation);
      };
      if (!targetIsFetching(queryClient, pathname)) {
        reveal(generation);
        return;
      }
      setStatus(routeLoadingLabel(pathname));
      unsubscribeRef.current = queryClient.getQueryCache().subscribe(check);
      schedule(() => reveal(generation, true), loadingFallbackMs);
    }, 0);
  }, [queryClient, reveal, schedule]);

  const begin = useCallback((pathname: string, commit?: () => void) => {
    clearAsyncWork();
    const generation = ++generationRef.current;
    destinationRef.current = pathname;
    setStatus("");
    setTransitionState({ type: "start" });
    schedule(() => {
      if (generation !== generationRef.current) return;
      commit?.();
      waitForTarget(pathname, generation);
    }, timing.coverMs);
  }, [clearAsyncWork, schedule, setTransitionState, timing.coverMs, waitForTarget]);

  useEffect(() => {
    if (motion === "off") {
      ++generationRef.current;
      clearAsyncWork();
      setTransitionState({ type: "settled" });
      setStatus("");
      return;
    }

    const interceptLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor
        || anchor.hasAttribute("download")
        || (anchor.target && anchor.target !== "_self")
      ) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const current = `${location.pathname}${location.search}${location.hash}`;
      const destination = `${url.pathname}${url.search}${url.hash}`;
      if (destination === current) return;

      event.preventDefault();
      begin(url.pathname, () => {
        selfNavigationRef.current = true;
        navigate(destination);
      });
    };

    document.addEventListener("click", interceptLink, true);
    return () => document.removeEventListener("click", interceptLink, true);
  }, [begin, clearAsyncWork, location.hash, location.pathname, location.search, motion, navigate, setTransitionState]);

  useEffect(() => {
    if (previousLocationKeyRef.current === location.key) {
      if (stateRef.current === "idle") setDisplayedChildren(children);
      return;
    }
    previousLocationKeyRef.current = location.key;
    if (selfNavigationRef.current) {
      selfNavigationRef.current = false;
      setDisplayedChildren(children);
      return;
    }
    if (motion === "off") {
      setDisplayedChildren(children);
      return;
    }
    begin(location.pathname, () => setDisplayedChildren(children));
  }, [begin, children, location.key, location.pathname, motion]);

  useEffect(() => () => clearAsyncWork(), [clearAsyncWork]);

  const reduced = motion === "reduced";
  const transitionStyle: TransitionStyles = {
    position: "relative",
    "--route-transition-total": `${timing.coverMs + timing.revealMs}ms`,
    "--route-transition-layer-delay": `${timing.layerDelayMs}ms`,
  };
  const overlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    overflow: "hidden",
    pointerEvents: state === "idle" ? "none" : "auto",
    opacity: state === "idle" ? 0 : 1,
    background: reduced ? "rgba(10, 31, 58, 0.72)" : "transparent",
    transition: reduced ? `opacity ${state === "covering" ? timing.coverMs : timing.revealMs}ms ease` : undefined,
  };

  return <div
    className={`route-transition route-transition-${motion} is-${state}`}
    data-transition-state={state}
    style={transitionStyle}
  >
    <div className="route-transition-content">{displayedChildren}</div>
    <div className="route-transition-status" aria-live="polite" aria-atomic="true">
      {status}
    </div>
    <div className="route-transition-curtains" aria-hidden="true" style={overlayStyle}>
      <span
        className="route-transition-curtain route-transition-curtain-rose"
        style={curtainStyle("rose", state, motion, timing)}
      />
      <span
        className="route-transition-curtain route-transition-curtain-cyan"
        style={curtainStyle("cyan", state, motion, timing)}
      />
      {status ? <span className="route-transition-loading-label" style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        display: "grid",
        placeItems: "center",
        color: "white",
        fontWeight: 700,
        letterSpacing: "0.08em",
      }}>{status}</span> : null}
    </div>
  </div>;
}
