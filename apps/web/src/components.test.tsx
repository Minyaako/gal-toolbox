// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  EntityCard,
  entityPrefetchHandlers,
  imageLoadStatus,
  imagePresentation,
  LoadingScene,
  NameBlock,
  StatePanel,
} from "./components";
import type { PrefetchPreference } from "./app/settings";
import { SettingsProvider } from "./app/settings";
import { entityPath, type EntitySummary } from "./api";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entity = {
  id: "v17",
  type: "vn" as const,
  name: {
    primary: "Ever17",
    original: null,
    romanized: null,
    alternatives: [],
  },
  image: null,
};

const sensitiveEntity: EntitySummary = {
  ...entity,
  image: {
    url: "https://example.test/ever17.jpg",
    thumbnailUrl: "https://example.test/ever17-thumb.jpg",
    sexual: 1,
    violence: 0,
  },
};

function Providers({ children, initialEntry = "/knowledge" }: { children: ReactNode; initialEntry?: string }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SettingsProvider>{children}</SettingsProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderSensitiveCard(cardEntity: EntitySummary): HTMLDivElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <Providers><EntityCard entity={cardEntity} /></Providers>,
  );
  return container;
}

describe("entity image presentation", () => {
  it("returns a semantic entity fallback when an image is absent or failed", () => {
    expect(imagePresentation(null, "Ever17")).toEqual({
      kind: "fallback",
      alt: "Ever17",
      fallbackText: "E",
    });
  });

  it("keeps a real image presentation when a thumbnail is available", () => {
    expect(imagePresentation({
      url: "cover.jpg",
      thumbnailUrl: "thumb.jpg",
      sexual: 0,
      violence: 0,
    }, "Ever17").kind).toBe("image");
  });

  it("returns to loading when the resolved source changes after an image loaded", () => {
    expect(imageLoadStatus(
      { source: "thumb.jpg", status: "loaded" },
      "cover.jpg",
    )).toBe("loading");
  });
});

describe("semantic heading levels", () => {
  it("uses h1 for NameBlock when requested", () => {
    const markup = renderToStaticMarkup(<NameBlock entity={entity} headingLevel={1} />);

    expect(markup).toContain("<h1>Ever17</h1>");
    expect(markup).not.toContain("<h2>");
  });

  it("keeps NameBlock at h2 by default", () => {
    const markup = renderToStaticMarkup(<NameBlock entity={entity} />);

    expect(markup).toContain("<h2>Ever17</h2>");
    expect(markup).not.toContain("<h1>");
  });

  it("uses h1 for LoadingScene when requested", () => {
    const markup = renderToStaticMarkup(<LoadingScene title="Loading" headingLevel={1} />);

    expect(markup).toContain("<h1>Loading</h1>");
    expect(markup).not.toContain("<h2>");
  });

  it("keeps LoadingScene at h2 by default", () => {
    const markup = renderToStaticMarkup(<LoadingScene title="Loading" />);

    expect(markup).toContain("<h2>Loading</h2>");
    expect(markup).not.toContain("<h1>");
  });

  it("uses h1 for StatePanel when requested", () => {
    const markup = renderToStaticMarkup(<StatePanel title="Failed" headingLevel={1} />);

    expect(markup).toContain("<h1>Failed</h1>");
    expect(markup).not.toContain("<h2>");
  });

  it("keeps StatePanel at h2 by default", () => {
    const markup = renderToStaticMarkup(<StatePanel title="Failed" />);

    expect(markup).toContain("<h2>Failed</h2>");
    expect(markup).not.toContain("<h1>");
  });
});

describe("sensitive image reveal controls", () => {
  it.each([
    ["sexual", { sexual: 1, violence: 0 }],
    ["violence", { sexual: 0, violence: 1 }],
  ])("renders one accessible button outside anchors for a %s-rated card", (_rating, flags) => {
    const container = renderSensitiveCard({
      ...sensitiveEntity,
      image: { ...sensitiveEntity.image!, ...flags },
    });

    expect(container.querySelectorAll("button.reveal-image")).toHaveLength(1);
    expect(container.querySelector('[aria-label="显示分级图片"]')).not.toBeNull();
    expect(container.querySelector("a button")).toBeNull();
  });

  it("reveals only the image while the sibling card link still navigates", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    function LocationProbe() {
      const location = useLocation();
      return <output data-testid="location">{location.pathname}</output>;
    }

    await act(async () => {
      root.render(
        <Providers>
          <EntityCard entity={sensitiveEntity} />
          <LocationProbe />
        </Providers>,
      );
    });

    const reveal = container.querySelector<HTMLButtonElement>("button.reveal-image");
    expect(reveal).not.toBeNull();
    await act(async () => reveal!.click());

    expect(container.querySelector("img")?.classList.contains("is-sensitive")).toBe(false);
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/knowledge");

    const link = container.querySelector<HTMLAnchorElement>("a.card-link");
    expect(link).not.toBeNull();
    await act(async () => link!.click());
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(entityPath(sensitiveEntity));

    await act(async () => root.unmount());
    container.remove();
  });
});

describe("entity intent prefetch policy", () => {
  it.each([
    ["data-saver", 1],
    ["balanced", 3],
    ["aggressive", 3],
  ] satisfies Array<[PrefetchPreference, number]>) (
    "%s binds only the allowed pointer and keyboard intent triggers",
    (preference, expectedCalls) => {
      let calls = 0;
      const handlers = entityPrefetchHandlers(preference, () => { calls += 1; });

      handlers.onPointerEnter?.({} as never);
      handlers.onFocus?.({} as never);
      handlers.onPointerDown?.({} as never);

      expect(calls).toBe(expectedCalls);
    },
  );
});
