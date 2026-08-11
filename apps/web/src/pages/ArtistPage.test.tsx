// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import type { ArtistDetail, ArtistWork, EntitySummary, Page } from "../api";
import { SettingsProvider } from "../app/settings";
import { TrailProvider } from "../trail";
import { ArtistPage } from "./ArtistPage";

const artist: EntitySummary = { id: "s1928", type: "staff", name: { primary: "画师", original: null, romanized: "Artist", alternatives: [] }, image: null };
const detail: ArtistDetail = { entity: artist, description: "Biography", language: "ja", aliases: [{ name: "Alias", latin: null, ismain: true }], externalLinks: [] };
const page: Page<ArtistWork> = { page: 1, pageSize: 12, more: false, items: [{ vn: { id: "v2", type: "vn", name: { primary: "Work", original: null, romanized: null, alternatives: [] }, image: null }, credits: [{ role: "art", note: "Key art" }, { role: "chardesign", note: null }] }] };

it("renders an artist profile with works-only relations and credits", () => {
  const client = new QueryClient(); client.setQueryData(["artist", "s1928"], detail); client.setQueryData(["artist-vns", "s1928"], { pages: [page], pageParams: [1] });
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/knowledge/artist/s1928"]}><SettingsProvider><TrailProvider><Routes><Route path="/knowledge/artist/:id" element={<ArtistPage />} /></Routes></TrailProvider></SettingsProvider></MemoryRouter></QueryClientProvider>);
  expect(markup).toContain("画师"); expect(markup).toContain("参与作品"); expect(markup).toContain("/knowledge/vn/v2"); expect(markup).toContain("Key art"); expect(markup).not.toContain("配过的角色");
});
