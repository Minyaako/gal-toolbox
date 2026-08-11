// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useNavigate, useRoutes } from "react-router-dom";
import { expect, it, vi } from "vitest";
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

it("updates cache status after mounting an ArtistPage without render-phase warnings", async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const client = new QueryClient();
  client.setQueryData(["artist", "s1928"], { entity: { id: "s1928", type: "staff", name: { primary: "画师", original: null, romanized: null, alternatives: [] }, image: null }, description: null, language: null, aliases: [], externalLinks: [] });
  client.setQueryData(["artist-vns", "s1928"], { pages: [{ items: [], page: 1, pageSize: 12, more: false }], pageParams: [1] });
  const fetcher = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).includes("/vns?") ? { items: [], page: 1, pageSize: 12, more: false } : { entity: { id: "s1928", type: "staff", name: { primary: "画师", original: null, romanized: null, alternatives: [] }, image: null }, description: null, language: null, aliases: [], externalLinks: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const Routes = () => useRoutes(appRoutes);
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/knowledge/artist/s1928"]}><TrailProvider><Routes /></TrailProvider></MemoryRouter></QueryClientProvider>));
  await act(async () => { client.setQueryData(["artist", "s1928"], (value) => value); });
  expect(error).not.toHaveBeenCalled();
  await act(async () => root.unmount()); container.remove(); error.mockRestore(); vi.unstubAllGlobals();
});

it("navigates from a stable route to an uncached artist without render-phase warnings", async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetcher = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).includes("/vns?") ? { items: [], page: 1, pageSize: 12, more: false } : { entity: { id: "s1928", type: "staff", name: { primary: "画师", original: null, romanized: null, alternatives: [] }, image: null }, description: null, language: null, aliases: [], externalLinks: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetcher);
  function NavigateToArtist() { const navigate = useNavigate(); useEffect(() => { navigate("/knowledge/artist/s1928"); }, [navigate]); return null; }
  const Routes = () => useRoutes(appRoutes); const container = document.createElement("div"); document.body.append(container); const root = createRoot(container); const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/ranking"]}><TrailProvider><NavigateToArtist /><Routes /></TrailProvider></MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
  expect(container.textContent).toContain("画师"); expect(client.getQueryCache().find({ queryKey: ["artist", "s1928"], exact: true })).toBeDefined(); expect(error).not.toHaveBeenCalled(); await act(async () => root.unmount()); container.remove(); error.mockRestore(); vi.unstubAllGlobals();
});
