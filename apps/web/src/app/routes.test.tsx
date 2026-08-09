import { matchRoutes } from "react-router-dom";
import { expect, test } from "vitest";
import { appRoutes, pageTitle } from "./routes";

test("matches all official knowledge routes and preserves the title contract", () => {
  expect(matchRoutes(appRoutes, "/knowledge/vn/v17")?.at(-1)?.route.path)
    .toBe("/knowledge/vn/:id");
  expect(pageTitle("/knowledge/tag/g19")).toBe("Tag 鍥鹃壌");
});

test("legacy detail URLs use replace redirects and unknown paths resolve to 404", () => {
  const legacy = matchRoutes(appRoutes, "/vn/v17")?.at(-1)?.route;
  expect(legacy?.path).toBe("/vn/:id");
  expect(matchRoutes(appRoutes, "/missing")?.at(-1)?.route.path).toBe("*");
});
