import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  entityPrefetchHandlers,
  imageLoadStatus,
  imagePresentation,
  LoadingScene,
  NameBlock,
  StatePanel,
} from "./components";
import type { PrefetchPreference } from "./app/settings";

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
