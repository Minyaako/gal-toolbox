import { matchRoutes } from "react-router-dom";
import { expect, test } from "vitest";
import { appRoutes, legacyRedirectContract, pageTitle } from "./routes";

test("matches official knowledge routes and returns the literal Tag 图鉴 title", () => {
  expect(matchRoutes(appRoutes, "/knowledge/vn/v17")?.at(-1)?.route.path)
    .toBe("/knowledge/vn/:id");
  expect(pageTitle("/knowledge/tag/g19")).toBe("Tag 图鉴");
});

test("matches official and legacy artist routes", () => {
  expect(matchRoutes(appRoutes, "/knowledge/artist/s1928")?.at(-1)?.route.path)
    .toBe("/knowledge/artist/:id");
  expect(matchRoutes(appRoutes, "/artist/s1928")?.at(-1)?.route.path)
    .toBe("/artist/:id");
  expect(pageTitle("/knowledge/artist/s1928")).toBe("画师图鉴");
});

test("returns the exact titles for the main routes", () => {
  expect(pageTitle("/")).toBe("百宝箱大厅");
  expect(pageTitle("/ranking")).toBe("Gal 排行");
  expect(pageTitle("/settings")).toBe("设置");
});

test("legacy detail URLs and unknown paths match their explicit routes", () => {
  const legacy = matchRoutes(appRoutes, "/vn/v17")?.at(-1)?.route;
  expect(legacy?.path).toBe("/vn/:id");
  expect(matchRoutes(appRoutes, "/missing")?.at(-1)?.route.path).toBe("*");
});

test("artist legacy URLs retain their destination context", () => {
  expect(legacyRedirectContract("artist", "s1928", "?from=v17", "#works")).toEqual({
    replace: true,
    to: "/knowledge/artist/s1928?from=v17#works",
  });
});

test("LegacyRedirect preserves the id, query, hash, and replace contract", () => {
  expect(legacyRedirectContract("vn", "v17", "?from=legacy&next=2", "#cast")).toEqual({
    replace: true,
    to: "/knowledge/vn/v17?from=legacy&next=2#cast",
  });
});
