import { describe, expect, it } from "vitest";
import { getSecondaryName } from "./tag-label";

describe("Tag secondary labels", () => {
  it("keeps a distinct English original beside the Chinese label", () => {
    expect(getSecondaryName({
      primary: "悬疑",
      original: "Mystery",
      romanized: null,
      alternatives: [],
    })).toBe("Mystery");
  });

  it("omits duplicate or unavailable secondary labels", () => {
    expect(getSecondaryName({
      primary: "Untranslated",
      original: null,
      romanized: null,
      alternatives: [],
    })).toBeNull();
    expect(getSecondaryName({
      primary: "ADV",
      original: "ADV",
      romanized: null,
      alternatives: [],
    })).toBeNull();
  });
});
