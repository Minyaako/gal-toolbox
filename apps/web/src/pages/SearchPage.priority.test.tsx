// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { SearchPage } from "./SearchPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = undefined;
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function waitForCalls(calls: string[], count: number): Promise<void> {
  for (let attempt = 0; attempt < 50 && calls.length < count; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  expect(calls).toHaveLength(count);
}

it("sends high, normal, then high when a buffered search is replaced", async () => {
  const priorities: string[] = [];
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const page = Number(new URL(url, "http://localhost").searchParams.get("page"));
    const query = new URL(url, "http://localhost").searchParams.get("q");
    urls.push(url);
    priorities.push(new Headers(init?.headers).get("X-Request-Priority") ?? "");
    return new Response(JSON.stringify({
      items: [],
      page,
      pageSize: 12,
      more: query === "a" && page === 1,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }));
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/knowledge?type=vn&q=a"]}>
          <SearchPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await waitForCalls(urls, 2);

  const input = container.querySelector<HTMLInputElement>("#knowledge-search");
  const form = input?.closest("form");
  if (!input || !form) throw new Error("Search form did not render");
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(input, "Ever17");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await waitForCalls(urls, 3);

  expect(urls.map((url) => new URL(url, "http://localhost").searchParams.get("page")))
    .toEqual(["1", "2", "1"]);
  expect(priorities).toEqual(["high", "normal", "high"]);
});
