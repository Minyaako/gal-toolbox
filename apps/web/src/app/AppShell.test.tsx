import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useRoutes } from "react-router-dom";
import { expect, it } from "vitest";
import { TrailProvider } from "../trail";
import { appRoutes } from "./routes";

it("keeps current module, global search, connectivity, cache, and settings in the shell status bar", () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["vn", "v17"], { title: "Ever17" });
  const Routes = () => useRoutes(appRoutes);

  const markup = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/ranking"]}>
        <TrailProvider><Routes /></TrailProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(markup).toContain('class="app-status-bar"');
  expect(markup).toContain('aria-label="当前模块"');
  expect(markup).toContain("Gal 排行");
  expect(markup).toContain('role="search"');
  expect(markup).toContain('action="/knowledge"');
  expect(markup).toContain('name="q"');
  expect(markup).toContain('aria-label="网络与缓存状态"');
  expect(markup).toContain("缓存 1");
  expect(markup).toContain('href="/settings"');
});
