import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { TrailProvider } from "../trail";
import { appRoutes } from "./routes";
import { SettingsProvider } from "./settings";
import {
  RouteTransition,
  isSameDocumentNavigation,
  reduceTransition,
  routeTargetIsReady,
  routeLoadingLabel,
  transitionOverlayStyle,
  transitionTiming,
} from "./RouteTransition";

describe("route transition state", () => {
  it("always returns to idle after a ready target or load failure", () => {
    expect(reduceTransition("idle", { type: "start" })).toBe("covering");
    expect(reduceTransition("covering", { type: "finish" })).toBe("revealing");
    expect(reduceTransition("revealing", { type: "settled" })).toBe("idle");
    expect(reduceTransition("covering", { type: "failed" })).toBe("revealing");
    expect(reduceTransition("revealing", { type: "failed" })).toBe("idle");
  });

  it("uses the full, reduced, and disabled timing contracts", () => {
    expect(transitionTiming("full")).toEqual({
      coverMs: 250,
      revealMs: 250,
      layerDelayMs: 70,
    });
    expect(transitionTiming("reduced")).toEqual({
      coverMs: 60,
      revealMs: 60,
      layerDelayMs: 0,
    });
    expect(transitionTiming("off")).toEqual({
      coverMs: 0,
      revealMs: 0,
      layerDelayMs: 0,
    });
  });

  it("reveals a cached target while its stale data refetches in the background", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["vn", "v17"], { id: "v17", title: "Cached title" });
    let resolveRefetch!: (value: { id: string; title: string }) => void;
    const refetch = queryClient.fetchQuery({
      queryKey: ["vn", "v17"],
      queryFn: () => new Promise((resolve) => {
        resolveRefetch = resolve;
      }),
      staleTime: 0,
    });

    expect(queryClient.isFetching({ queryKey: ["vn", "v17"], exact: true })).toBe(1);
    expect(routeTargetIsReady(queryClient, "/knowledge/vn/v17")).toBe(true);

    resolveRefetch({ id: "v17", title: "Fresh title" });
    await refetch;
  });

  it("starts the reduced reveal fade while the transition is revealing", () => {
    const timing = transitionTiming("reduced");

    expect(transitionOverlayStyle("covering", "reduced", timing).opacity).toBe(1);
    expect(transitionOverlayStyle("revealing", "reduced", timing)).toMatchObject({
      opacity: 0,
      transition: "opacity 60ms ease",
    });
  });

  it("leaves same-document fragment links to native navigation", () => {
    const current = new URL("https://example.test/knowledge?view=grid#top");

    expect(isSameDocumentNavigation(
      current,
      new URL("https://example.test/knowledge?view=grid#main-content"),
    )).toBe(true);
    expect(isSameDocumentNavigation(
      current,
      new URL("https://example.test/knowledge?view=list#main-content"),
    )).toBe(false);
  });

  it("announces a destination-specific loading label", () => {
    expect(routeLoadingLabel("/knowledge/vn/v17")).toBe("正在准备作品资料");
    expect(routeLoadingLabel("/knowledge/character/c30")).toBe("正在准备角色资料");
    expect(routeLoadingLabel("/knowledge/staff/s81")).toBe("正在准备声优资料");
    expect(routeLoadingLabel("/knowledge/tag/g19")).toBe("正在准备 Tag 资料");
    expect(routeLoadingLabel("/settings")).toBe("正在打开设置");
  });
});

it("keeps the polite transition status separate from aria-hidden curtains", () => {
  const queryClient = new QueryClient();
  const markup = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettingsProvider>
          <RouteTransition><h1>Current route</h1></RouteTransition>
        </SettingsProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(markup).toContain('class="route-transition-status"');
  expect(markup).toContain('aria-live="polite"');
  expect(markup).toContain('class="route-transition-curtains"');
  expect(markup).toContain('aria-hidden="true"');
  expect(markup).toContain("Current route");
});

it("mounts the transition boundary around AppShell routed content", () => {
  const queryClient = new QueryClient();
  const Routes = () => useRoutes(appRoutes);
  const markup = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <TrailProvider><Routes /></TrailProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(markup).toContain('class="route-transition route-transition-');
  expect(markup).toContain('class="route-transition-content"');
});
