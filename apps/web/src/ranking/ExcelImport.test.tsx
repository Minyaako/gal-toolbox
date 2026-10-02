// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ExcelJS from "exceljs";
import { afterEach, expect, it, vi } from "vitest";
import { ExcelImport } from "./ExcelImport";
import { getSearchPage } from "../api";
vi.mock("../api", async (load) => ({ ...await load<typeof import("../api")>(), getSearchPage: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
function button(label: string) { const found = [...document.querySelectorAll("button")].find((item) => item.textContent === label); if (!found) throw new Error(`Missing ${label}`); return found; }
async function ready() { for (let i = 0; i < 10; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
it("retains unmatched rows and renews an expired import without re-running search", async () => {
  vi.mocked(getSearchPage).mockResolvedValue({ items: [], page: 1, pageSize: 12, more: false });
  let reservations = 0;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ importId: `token${++reservations}`, expiresAt: reservations === 1 ? Date.now() - 1000 : Date.now() + 60_000 }))));
  const submit = vi.fn(async () => true);
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root.render(<ExcelImport busy={false} onSubmit={submit} onClose={() => undefined} />));
  const book = new ExcelJS.Workbook(); book.addWorksheet("data").addRows([["作品", "评分", "extra"], ["未匹配作品", 8.5, "我的评价"]]);
  const bytes = await book.xlsx.writeBuffer(); const buffer = new Uint8Array(bytes).buffer;
  const file = new File([buffer], "ratings.xlsx");
  Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!; Object.defineProperty(input, "files", { value: [file] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  await ready();
  await act(async () => (document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!).click());
  await act(async () => button("确认列并开始匹配").click()); await ready();
  expect(document.body.textContent).toContain("未找到作品");
  await act(async () => button("保留原名称提交").click());
  await act(async () => button("提交全部作品").click()); expect(submit).not.toHaveBeenCalled(); expect(document.body.textContent).toContain("凭证已过期");
  await act(async () => button("重新申请导入凭证").click());
  await act(async () => button("提交全部作品").click());
  expect(submit).toHaveBeenCalledWith([{ name: "未匹配作品", vnId: null, score: 8.5, extra: "我的评价" }], "token2");
  expect(getSearchPage).toHaveBeenCalledTimes(1);
});
