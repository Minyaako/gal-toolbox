import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EntityImage } from "../components";
import { SettingsPage } from "../pages/SettingsPage";
import {
  DEFAULT_SETTINGS,
  SettingsProvider,
  effectiveMotion,
  readSettings,
  writeSettings,
  type UserSettings,
} from "./settings";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const customSettings: UserSettings = {
  motion: "reduced",
  allowFullMotion: false,
  imageQuality: "high",
  prefetch: "aggressive",
  density: "compact",
};

describe("versioned user settings", () => {
  it("falls back to defaults for corrupt or obsolete local settings", () => {
    const storage = new MemoryStorage();
    storage.setItem("gal-toolbox-settings-v1", "{bad json");
    expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS);

    storage.setItem("gal-toolbox-settings-v1", JSON.stringify({ motion: "full" }));
    expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips a complete valid preference record", () => {
    const storage = new MemoryStorage();

    writeSettings(customSettings, storage);

    expect(readSettings(storage)).toEqual(customSettings);
  });

  it("rejects invalid values instead of partially applying them", () => {
    const storage = new MemoryStorage();
    storage.setItem("gal-toolbox-settings-v1", JSON.stringify({
      ...customSettings,
      density: "tiny",
    }));

    expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("effective motion", () => {
  it("lets system reduced motion win until full motion is explicitly permitted", () => {
    expect(effectiveMotion({
      ...DEFAULT_SETTINGS,
      motion: "full",
      allowFullMotion: false,
    }, true)).toBe("reduced");

    expect(effectiveMotion({
      ...DEFAULT_SETTINGS,
      motion: "full",
      allowFullMotion: true,
    }, true)).toBe("full");
  });

  it("preserves explicit reduced and off choices regardless of the system setting", () => {
    expect(effectiveMotion({ ...DEFAULT_SETTINGS, motion: "reduced" }, false))
      .toBe("reduced");
    expect(effectiveMotion({ ...DEFAULT_SETTINGS, motion: "off" }, true))
      .toBe("off");
  });
});

describe("settings consumers", () => {
  it("renders labelled controls for every preference and cache clearing", () => {
    const storage = new MemoryStorage();
    const queryClient = new QueryClient();
    queryClient.setQueryData(["vn", "v17"], { id: "v17" });
    const markup = renderToStaticMarkup(createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        SettingsProvider,
        { storage, children: createElement(SettingsPage) },
      ),
    ));

    expect(markup).toContain("页面转场");
    expect(markup).toContain("图片质量");
    expect(markup).toContain("预加载强度");
    expect(markup).toContain("界面密度");
    expect(markup).toContain("缓存概览");
    expect(markup).toContain("1 项查询");
    expect(markup).toContain("清理本地偏好与查询缓存");
  });

  it("maps image quality only to browser source and loading hints", () => {
    const storage = new MemoryStorage();
    writeSettings({ ...DEFAULT_SETTINGS, imageQuality: "high" }, storage);
    const highMarkup = renderToStaticMarkup(createElement(
      SettingsProvider,
      {
        storage,
        children: createElement(EntityImage, {
          image: {
            url: "cover.jpg",
            thumbnailUrl: "thumb.jpg",
            sexual: 0,
            violence: 0,
          },
          alt: "Ever17",
          eager: true,
        }),
      },
    ));
    expect(highMarkup).toContain('src="cover.jpg"');
    expect(highMarkup).toContain('loading="eager"');

    storage.clear();
    writeSettings({ ...DEFAULT_SETTINGS, imageQuality: "data-saver" }, storage);
    const saverMarkup = renderToStaticMarkup(createElement(
      SettingsProvider,
      {
        storage,
        children: createElement(EntityImage, {
          image: {
            url: "cover.jpg",
            thumbnailUrl: "thumb.jpg",
            sexual: 0,
            violence: 0,
          },
          alt: "Ever17",
          eager: true,
        }),
      },
    ));
    expect(saverMarkup).toContain('src="thumb.jpg"');
    expect(saverMarkup).toContain('loading="lazy"');
  });
});
