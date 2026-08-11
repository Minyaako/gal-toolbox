import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { SettingsProvider } from "../app/settings";
import { SearchPage } from "./SearchPage";

it("uses an ordinary labelled button group instead of incomplete tab semantics", () => {
  const markup = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/knowledge"]}>
        <SettingsProvider><SearchPage /></SettingsProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(markup).toContain('<fieldset class="search-type-group">');
  expect(markup).toContain("<legend>搜索类型</legend>");
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).not.toContain('role="tablist"');
  expect(markup).not.toContain('role="tab"');
});
