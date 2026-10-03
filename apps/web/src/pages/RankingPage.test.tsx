// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsProvider } from "../app/settings";
import { RankingPage } from "./RankingPage";
import type { Board } from "../ranking/api";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const board: Board = { id: "b1", title: "我的清单", ownerId: "u1", version: 3, mode: "auto", entries: ["甲", "乙"].map((name, index) => ({ id: `e${index}`, name, vnId: index ? null : "v1", image: null, vndbRating: 8, seedScore: 8 - index, averageScore: null, scoreCount: 0, sortScore: null, contributions: [] })) };
async function mount(owner = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["ranking-user"], { user: { id: owner ? "u1" : "u2", displayName: "访客", email: "a@b.com", emailVerified: false } });
  client.setQueryData(["rankings"], { items: [{ ...board, entryCount: 2 }] });
  client.setQueryData(["ranking", "b1"], board);
  const mutations: { url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method !== "GET") { mutations.push({ url, body: JSON.parse(String(init?.body)) }); return new Response(JSON.stringify({ error: { code: "VERSION_CONFLICT", message: "conflict" } }), { status: 409 }); }
    return new Response(JSON.stringify({ user: { id: owner ? "u1" : "u2", displayName: "访客", email: "a@b.com", emailVerified: false } }));
  }));
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/ranking?board=b1"]}><SettingsProvider><RankingPage /></SettingsProvider></MemoryRouter></QueryClientProvider>));
  return { client, mutations };
}
function button(text: string) { const found = [...document.querySelectorAll("button")].find((item) => item.textContent === text); if (!found) throw new Error(`Missing button ${text}`); return found; }
it("previews numeric movement without cache mutation and cancel restores original order", async () => {
  const { client, mutations } = await mount();
  expect(document.querySelector('a[href="/knowledge/vn/v1?board=b1"]')).not.toBeNull();
  await act(async () => button("编辑顺序").click());
  const form = document.querySelectorAll<HTMLFormElement>(".ranking-position")[1]!;
  form.querySelector<HTMLInputElement>("input")!.value = "1";
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(document.querySelector(".ranking-queue > li")?.textContent).toContain("乙");
  expect(client.getQueryData<Board>(["ranking", "b1"])?.entries[0]?.name).toBe("甲");
  expect(mutations).toHaveLength(0);
  await act(async () => button("取消排序预览").click());
  expect(document.querySelector(".ranking-queue > li")?.textContent).toContain("甲");
});
it("preserves a local order after a version conflict and sends only replayable moves", async () => {
  const { mutations } = await mount(); await act(async () => button("编辑顺序").click());
  const form = document.querySelectorAll<HTMLFormElement>(".ranking-position")[1]!; form.querySelector<HTMLInputElement>("input")!.value = "1";
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => button("保存排序").click());
  expect(mutations[0]).toEqual({ url: "/api/v1/rankings/b1/order", body: { version: 3, moves: [{ entryId: "e1", position: 1 }] } });
  expect(document.body.textContent).toContain("输入已保留");
  expect(document.querySelector(".ranking-queue > li")?.textContent).toContain("乙");
});
it("allows non-owners to contribute but never presents owner controls", async () => {
  await mount(false); expect(button("搜索并评分")).toBeDefined();
  expect(document.body.textContent).not.toContain("编辑顺序"); expect(document.body.textContent).not.toContain("移除");
});
it("clears owner-only draft state on identity change", async () => {
  const { client } = await mount(); await act(async () => button("编辑顺序").click());
  await act(async () => client.setQueryData(["ranking-user"], { user: null }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  expect(document.querySelector(".ranking-position")).toBeNull();
  expect(document.body.textContent).toContain("登录后即可贡献评分");
  expect(document.body.textContent).not.toContain("保存排序");
});
