import { matchRoutes } from "react-router-dom";
import { expect, test } from "vitest";
import { appRoutes, legacyRedirectContract, pageTitle } from "./routes";

test("matches official knowledge routes and returns the literal Tag 图鉴 title", () => {
  expect(matchRoutes(appRoutes, "/knowledge/vn/v17")?.at(-1)?.route.path)
    .toBe("/knowledge/vn/:id");
  expect(pageTitle("/knowledge/tag/g19")).toBe("Tag 图鉴");
});

test("legacy detail URLs and unknown paths match their explicit routes", () => {
  const legacy = matchRoutes(appRoutes, "/vn/v17")?.at(-1)?.route;
  expect(legacy?.path).toBe("/vn/:id");
  expect(matchRoutes(appRoutes, "/missing")?.at(-1)?.route.path).toBe("*");
});

test("LegacyRedirect preserves the id, query, hash, and replace contract", () => {
  expect(legacyRedirectContract("vn", "v17", "?from=legacy&next=2", "#cast")).toEqual({
    replace: true,
    to: "/knowledge/vn/v17?from=legacy&next=2#cast",
  });
});
