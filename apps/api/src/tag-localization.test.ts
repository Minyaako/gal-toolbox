import { describe, expect, it } from "vitest";
import { localizeTagName, searchLocalizedTags } from "./tag-localization.js";

describe("Tag localization", () => {
  it("uses Simplified Chinese as primary and preserves English", () => {
    expect(localizeTagName("g19", "Mystery", ["Mysteries"])).toEqual({
      primary: "悬疑",
      original: "Mystery",
      romanized: null,
      alternatives: ["Mysteries"],
    });
  });

  it("falls back to VNDB English when a translation is missing", () => {
    expect(localizeTagName("g999999", "Untranslated", [])).toEqual({
      primary: "Untranslated",
      original: null,
      romanized: null,
      alternatives: [],
    });
  });

  it("orders exact Chinese matches before prefix and substring matches", () => {
    const matches = searchLocalizedTags("悬疑");
    expect(matches[0]).toMatchObject({ id: "g19", en: "Mystery", zhHans: "悬疑" });
    expect(matches.every((tag) => tag.zhHans.includes("悬疑") || tag.en.toLowerCase().includes("悬疑")))
      .toBe(true);
  });
});
