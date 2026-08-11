import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type MotionPreference = "full" | "reduced" | "off";
export type ImageQualityPreference = "data-saver" | "balanced" | "high";
export type PrefetchPreference = "data-saver" | "balanced" | "aggressive";
export type DensityPreference = "comfortable" | "standard" | "compact";

export type UserSettings = {
  motion: MotionPreference;
  allowFullMotion: boolean;
  imageQuality: ImageQualityPreference;
  prefetch: PrefetchPreference;
  density: DensityPreference;
};

export const SETTINGS_STORAGE_KEY = "gal-toolbox-settings-v1";

export const DEFAULT_SETTINGS: UserSettings = {
  motion: "full",
  allowFullMotion: false,
  imageQuality: "balanced",
  prefetch: "balanced",
  density: "standard",
};

const motionPreferences: readonly MotionPreference[] = ["full", "reduced", "off"];
const imageQualityPreferences: readonly ImageQualityPreference[] = [
  "data-saver",
  "balanced",
  "high",
];
const prefetchPreferences: readonly PrefetchPreference[] = [
  "data-saver",
  "balanced",
  "aggressive",
];
const densityPreferences: readonly DensityPreference[] = [
  "comfortable",
  "standard",
  "compact",
];

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function parseSettings(raw: string | null): UserSettings | null {
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as Partial<UserSettings>;
  if (
    !includes(motionPreferences, candidate.motion)
    || typeof candidate.allowFullMotion !== "boolean"
    || !includes(imageQualityPreferences, candidate.imageQuality)
    || !includes(prefetchPreferences, candidate.prefetch)
    || !includes(densityPreferences, candidate.density)
  ) return null;
  return {
    motion: candidate.motion,
    allowFullMotion: candidate.allowFullMotion,
    imageQuality: candidate.imageQuality,
    prefetch: candidate.prefetch,
    density: candidate.density,
  };
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readSettings(storage: Storage | undefined = browserStorage()): UserSettings {
  try {
    return parseSettings(storage?.getItem(SETTINGS_STORAGE_KEY) ?? null)
      ?? { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(
  settings: UserSettings,
  storage: Storage | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Preference persistence is best effort (private mode and quotas may reject it).
  }
}

export function effectiveMotion(
  settings: UserSettings,
  systemReduced: boolean,
): MotionPreference {
  if (settings.motion !== "full") return settings.motion;
  if (systemReduced && !settings.allowFullMotion) return "reduced";
  return "full";
}

type SettingsContextValue = {
  settings: UserSettings;
  motion: MotionPreference;
  setSettings: Dispatch<SetStateAction<UserSettings>>;
  clearSettings: () => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function useSystemReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => globalThis.matchMedia?.(query).matches ?? false);

  useEffect(() => {
    const media = globalThis.matchMedia?.(query);
    if (!media) return;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

export function SettingsProvider({
  children,
  storage,
}: {
  children: ReactNode;
  storage?: Storage;
}) {
  const resolvedStorage = storage ?? browserStorage();
  const [settings, setSettingsState] = useState(() => readSettings(resolvedStorage));
  const systemReduced = useSystemReducedMotion();

  const setSettings = useCallback<Dispatch<SetStateAction<UserSettings>>>((next) => {
    setSettingsState((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      writeSettings(resolved, resolvedStorage);
      return resolved;
    });
  }, [resolvedStorage]);

  const clearSettings = useCallback(() => {
    try {
      resolvedStorage?.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // State still resets if storage is unavailable.
    }
    setSettingsState({ ...DEFAULT_SETTINGS });
  }, [resolvedStorage]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.density = settings.density;
  }, [settings.density]);

  const value = useMemo<SettingsContextValue>(() => ({
    settings,
    motion: effectiveMotion(settings, systemReduced),
    setSettings,
    clearSettings,
  }), [clearSettings, setSettings, settings, systemReduced]);

  return createElement(SettingsContext.Provider, { value }, children);
}

export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}
