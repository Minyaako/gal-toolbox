import { describe, expect, it } from "vitest";
import { imageLoadStatus, imagePresentation } from "./components";

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
