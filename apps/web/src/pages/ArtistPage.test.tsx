// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { ArtistDetail, ArtistWork, EntitySummary, Page } from "../api";
import { SettingsProvider } from "../app/settings";
import { TrailProvider } from "../trail";
import { ArtistPage } from "./ArtistPage";

const runtime = vi.hoisted(() => ({ loader: undefined as undefined | { pageScope: string; pageProgress: number; hasNextPage: boolean; isFetching: boolean; buffered: boolean; label?: string; onLoad: () => void }, reveal: vi.fn() }));
vi.mock("../buffered-pages", async (importOriginal) => ({ ...(await importOriginal<typeof import("../buffered-pages")>()), useBufferedPages: vi.fn() }));
vi.mock("../components", async (importOriginal) => ({ ...(await importOriginal<typeof import("../components")>()), AutoPageLoader: (props: typeof runtime.loader extends infer T ? Exclude<T, undefined> : never) => { runtime.loader = props; return <button type="button" onClick={props.onLoad}>{props.label}</button>; } }));
import { useBufferedPages } from "../buffered-pages";

const artist: EntitySummary = { id: "s1928", type: "staff", name: { primary: "画师", original: null, romanized: "Artist", alternatives: [] }, image: null };
const detail: ArtistDetail = { entity: artist, description: "Biography", language: "ja", aliases: [{ name: "Alias", latin: null, ismain: true }], externalLinks: [] };
const page: Page<ArtistWork> = { page: 1, pageSize: 12, more: false, items: [{ vn: { id: "v2", type: "vn", name: { primary: "Work", original: null, romanized: null, alternatives: [] }, image: null }, credits: [{ role: "art", note: "Key art" }, { role: "chardesign", note: null }] }] };

beforeEach(() => { runtime.loader = undefined; runtime.reveal.mockReset(); vi.mocked(useBufferedPages).mockReturnValue({ items: page.items, hasBufferedPage: false, canRevealNextPage: false, isWaitingForBuffer: false, visiblePageCount: 1, revealNextPage: runtime.reveal } as ReturnType<typeof useBufferedPages>); });

it("renders aliases, biography, ordered role credits, and works-only relations", () => {
  const client = new QueryClient(); client.setQueryData(["artist", "s1928"], detail); client.setQueryData(["artist-vns", "s1928"], { pages: [page], pageParams: [1] });
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/knowledge/artist/s1928"]}><SettingsProvider><TrailProvider><Routes><Route path="/knowledge/artist/:id" element={<ArtistPage />} /></Routes></TrailProvider></SettingsProvider></MemoryRouter></QueryClientProvider>);
  expect(markup).toContain("画师"); expect(markup).toContain("Alias"); expect(markup).toContain("Biography"); expect(markup).toContain("参与作品"); expect(markup).toContain("/knowledge/vn/v2"); expect(markup).toContain("Key art"); expect(markup.indexOf("原画／美术")).toBeLessThan(markup.indexOf("角色设计")); expect(markup).not.toContain("配过的角色");
});

it("uses the exact empty-work and missing-biography states", () => {
  vi.mocked(useBufferedPages).mockReturnValue({ items: [], hasBufferedPage: false, canRevealNextPage: false, isWaitingForBuffer: false, visiblePageCount: 1, revealNextPage: runtime.reveal } as ReturnType<typeof useBufferedPages>);
  const client = new QueryClient(); client.setQueryData(["artist", "s1928"], { ...detail, description: null }); client.setQueryData(["artist-vns", "s1928"], { pages: [{ ...page, items: [] }], pageParams: [1] });
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/knowledge/artist/s1928"]}><SettingsProvider><TrailProvider><Routes><Route path="/knowledge/artist/:id" element={<ArtistPage />} /></Routes></TrailProvider></SettingsProvider></MemoryRouter></QueryClientProvider>);
  expect(markup).toContain("暂无画师作品记录"); expect(markup).toContain("VNDB 暂无画师简介。");
});

it("keeps a long artist note visible in a narrow work card", () => {
  const longNote = "A deliberately long artist credit note that must wrap instead of being clipped at a narrow width"; vi.mocked(useBufferedPages).mockReturnValue({ items: [{ ...page.items[0]!, credits: [{ role: "art", note: longNote }] }], hasBufferedPage: false, canRevealNextPage: false, isWaitingForBuffer: false, visiblePageCount: 1, revealNextPage: runtime.reveal } as ReturnType<typeof useBufferedPages>);
  const client = new QueryClient(); client.setQueryData(["artist", "s1928"], detail); client.setQueryData(["artist-vns", "s1928"], { pages: [{ ...page, items: [{ ...page.items[0]!, credits: [{ role: "art", note: "A deliberately long artist credit note that must wrap instead of being clipped at a narrow width" }] }] }], pageParams: [1] });
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/knowledge/artist/s1928"]}><SettingsProvider><TrailProvider><Routes><Route path="/knowledge/artist/:id" element={<ArtistPage />} /></Routes></TrailProvider></SettingsProvider></MemoryRouter></QueryClientProvider>);
  expect(markup).toContain("must wrap instead of being clipped");
  expect(readFileSync("src/styles/knowledge.css", "utf8")).toMatch(/\.card-meta \.artist-credits[^}]*white-space:\s*normal/);
});

it("uses the artist scope and buffered-page loader label when more work pages exist", () => {
  vi.mocked(useBufferedPages).mockReturnValue({ items: page.items, hasBufferedPage: true, canRevealNextPage: true, isWaitingForBuffer: false, visiblePageCount: 1, revealNextPage: runtime.reveal } as ReturnType<typeof useBufferedPages>); const client = new QueryClient(); client.setQueryData(["artist", "s1928"], detail); client.setQueryData(["artist-vns", "s1928"], { pages: [{ ...page, more: true }], pageParams: [1] });
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/knowledge/artist/s1928"]}><SettingsProvider><TrailProvider><Routes><Route path="/knowledge/artist/:id" element={<ArtistPage />} /></Routes></TrailProvider></SettingsProvider></MemoryRouter></QueryClientProvider>);
  expect(markup).toContain("下一页已准备好"); expect(vi.mocked(useBufferedPages)).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "artist:s1928", pages: [expect.objectContaining({ more: true })], hasNextPage: true })); expect(runtime.loader).toMatchObject({ pageScope: "artist:s1928", pageProgress: 1, hasNextPage: true, isFetching: false, buffered: true, label: "下一页已准备好" }); runtime.loader?.onLoad(); expect(runtime.reveal).toHaveBeenCalledTimes(1);
});
