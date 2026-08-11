// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { VnDetail } from "../api";
import { SettingsProvider } from "../app/settings";
import { TrailProvider } from "../trail";
import { RelationRail, VnPage } from "./VnPage";

const vn: VnDetail = {
  entity: {
    id: "v1",
    type: "vn",
    name: { primary: "测试作品", original: null, romanized: null, alternatives: [] },
    image: null,
  },
  description: null,
  released: null,
  rating: null,
  voteCount: 0,
  relations: [{
    entity: {
      id: "v2",
      type: "vn",
      name: { primary: "敏感关联作品", original: null, romanized: null, alternatives: [] },
      image: {
        url: "https://example.test/relation.jpg",
        thumbnailUrl: "https://example.test/relation-thumb.jpg",
        sexual: 1,
        violence: 0,
      },
    },
    relation: "ser",
  }],
  tags: [],
  cast: [{
    character: {
      id: "c1",
      type: "character",
      name: { primary: "测试角色", original: null, romanized: "Test Character", alternatives: [] },
      image: {
        url: "https://example.test/character.jpg",
        thumbnailUrl: "https://example.test/character-thumb.jpg",
        sexual: 0,
        violence: 1,
      },
    },
    staff: {
      id: "s1",
      type: "staff",
      name: { primary: "测试声优", original: null, romanized: "Test Staff", alternatives: [] },
      image: null,
    },
    note: null,
  }],
  artists: [],
};

describe("RelationRail", () => {
  it("keeps relation cards together in one normal-flow rail", () => {
    const markup = renderToStaticMarkup(
      <RelationRail>
        <section className="relation-rail-card">Tags</section>
        <section className="relation-rail-card">Related works</section>
      </RelationRail>,
    );

    expect(markup).toBe(
      '<div class="relation-rail"><section class="relation-rail-card">Tags</section><section class="relation-rail-card">Related works</section></div>',
    );
  });
});

describe("artist relations", () => {
  it("keeps cast and artists in the primary stack beside the relation rail", () => {
    const queryClient = new QueryClient(); queryClient.setQueryData(["vn", "v1"], { ...vn, artists: [{ staff: { id: "s1928", type: "staff", name: { primary: "画师", original: null, romanized: null, alternatives: [] }, image: null }, credits: [{ role: "art", note: null }] }], tags: [{ tag: { id: "g1", type: "tag", name: { primary: "Tag", original: null, romanized: null, alternatives: [] }, image: null }, rating: 1, spoiler: 0, category: "cont" }] });
    const markup = renderToStaticMarkup(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/knowledge/vn/v1"]}><SettingsProvider><TrailProvider><Routes><Route path="/knowledge/vn/:id" element={<VnPage />} /></Routes></TrailProvider></SettingsProvider></MemoryRouter></QueryClientProvider>);
    expect(markup).toMatch(/detail-primary-stack[\s\S]*artist-section[\s\S]*<div class="relation-rail">/);
    expect(readFileSync("src/styles/knowledge.css", "utf8")).toMatch(/\.detail-primary-stack\s*\{[^}]*min-width:\s*0/);
  });
  it("renders each artist once with ordered role labels and notes", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["vn", "v1"], { ...vn, artists: [{
      staff: { id: "s1928", type: "staff", name: { primary: "画师", original: "原文", romanized: "Artist", alternatives: [] }, image: null },
      credits: [{ role: "art", note: null }, { role: "chardesign", note: "Character sprites, BG" }],
    }, {
      staff: { id: "s223", type: "staff", name: { primary: "第二画师", original: null, romanized: "Second Artist", alternatives: [] }, image: null },
      credits: [{ role: "art", note: "Character sprites, BG" }],
    }] });
    const markup = renderToStaticMarkup(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/knowledge/vn/v1"]}><SettingsProvider><TrailProvider><Routes><Route path="/knowledge/vn/:id" element={<VnPage />} /></Routes></TrailProvider></SettingsProvider></MemoryRouter></QueryClientProvider>);
    expect(markup).toContain("/knowledge/artist/s1928");
    expect(markup).toContain("原画／美术");
    expect(markup).toContain("角色设计");
    expect(markup).toContain("Character sprites, BG");
    expect((markup.match(/\/knowledge\/artist\/s1928/g) ?? [])).toHaveLength(1);
    expect((markup.match(/\/knowledge\/artist\/s223/g) ?? [])).toHaveLength(1);
    expect(markup).toContain("原文"); expect(markup).toContain("Artist"); expect(markup).toContain("Second Artist");
    expect(markup).toMatch(/href="\/knowledge\/artist\/s223"[\s\S]*?Character sprites, BG/);
  });

  it("omits the artist section when no artist relation exists", () => {
    const queryClient = new QueryClient(); queryClient.setQueryData(["vn", "v1"], vn);
    const markup = renderToStaticMarkup(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/knowledge/vn/v1"]}><SettingsProvider><TrailProvider><Routes><Route path="/knowledge/vn/:id" element={<VnPage />} /></Routes></TrailProvider></SettingsProvider></MemoryRouter></QueryClientProvider>);
    expect(markup).not.toContain("原画与角色设计");
  });
});

describe("compact cast image reveal", () => {
  it("uses short visible copy and keeps the reveal button outside the character link", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["vn", "v1"], vn);
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/knowledge/vn/v1"]}>
          <SettingsProvider>
            <TrailProvider>
              <Routes><Route path="/knowledge/vn/:id" element={<VnPage />} /></Routes>
            </TrailProvider>
          </SettingsProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const reveal = container.querySelector<HTMLButtonElement>("button.reveal-image");
    expect(reveal?.textContent?.trim()).toBe("显示");
    expect(reveal?.getAttribute("aria-label")).toBe("显示分级图片");
    expect(container.querySelector("a button")).toBeNull();
  });

  it("uses compact reveal copy for narrow relation-rail entity cards", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["vn", "v1"], vn);
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/knowledge/vn/v1"]}>
          <SettingsProvider>
            <TrailProvider>
              <Routes><Route path="/knowledge/vn/:id" element={<VnPage />} /></Routes>
            </TrailProvider>
          </SettingsProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const reveal = container.querySelector<HTMLButtonElement>(
      ".relation-rail-card .entity-card button.reveal-image",
    );
    expect(reveal?.textContent?.trim()).toBe("显示");
    expect(reveal?.getAttribute("aria-label")).toBe("显示分级图片");
    expect(container.querySelector(".relation-rail-card .entity-card a button")).toBeNull();
  });

  it("gives compact reveal controls room above the stretched navigation layer", () => {
    const styles = [
      readFileSync("src/styles.css", "utf8"),
      readFileSync("src/styles/knowledge.css", "utf8"),
    ].join("\n");

    expect(styles).toMatch(/\.image-frame\.is-compact\s+\.reveal-image\s*\{[^}]*min-height:\s*32px[^}]*overflow:\s*visible/s);
    expect(styles).toMatch(/\.card-link::before[^}]*z-index:\s*2/s);
    expect(styles).toMatch(/\.reveal-image\s*\{[^}]*z-index:\s*3/s);
  });
});
