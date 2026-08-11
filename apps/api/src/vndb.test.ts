import { describe, expect, it } from "vitest";
import { cleanVndbText, mapTagSummary, resolvePersonName, resolveVnName } from "./vndb.js";

describe("name resolution", () => {
  it("prefers simplified Chinese VN titles", () => {
    const name = resolveVnName({
      id: "v17",
      title: "Ever17 -the out of infinity-",
      alttitle: "Ever17 -the out of infinity-",
      titles: [
        { lang: "ja", title: "Ever17 -the out of infinity-", main: true },
        { lang: "zh-Hans", title: "时空轮回" },
      ],
    });
    expect(name.primary).toBe("时空轮回");
    expect(name.romanized).toBe("Ever17 -the out of infinity-");
  });

  it("uses original person names as the primary label", () => {
    const name = resolvePersonName({ id: "s81", name: "Asakawa Yuu", original: "浅川 悠" });
    expect(name.primary).toBe("浅川 悠");
    expect(name.romanized).toBe("Asakawa Yuu");
  });
});

describe("VNDB formatting", () => {
  it("keeps readable labels while removing formatting codes", () => {
    expect(cleanVndbText("From [url=https://example.com]Wikipedia[/url]"))
      .toBe("From Wikipedia");
  });
});

describe("tag mapping", () => {
  it("maps a VNDB tag into the shared entity shape", () => {
    expect(mapTagSummary({ id: "g19", name: "Mystery", aliases: ["Mysteries"] }))
      .toMatchObject({
        id: "g19",
        type: "tag",
        name: {
          primary: "悬疑",
          original: "Mystery",
          alternatives: ["Mysteries"],
        },
        image: null,
      });
  });
});
