import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { cellText, exactMatch, mapRows, moveEntry, validateWorkbookZip } from "./model";
import type { EntitySummary } from "../api";
import type { RankingEntry } from "./api";

describe("Excel mapping", () => {
  it("maps selected columns and headers without rescaling scores", () => {
    expect(mapRows({ name: "Sheet", rows: [["note", "title", "score"], ["评语", "中文作品", 8.25], ["", "", ""], ["zero", "另一作", 0]] }, [1, 2, 0], true)).toEqual([{ name: "中文作品", score: 8.25, extra: "评语", vnId: null }, { name: "另一作", score: 0, extra: "zero", vnId: null }]);
  });
  it("rejects duplicate columns, blank/out-of-range scores, formulas and excessive rows", () => {
    const sheet = { name: "s", rows: [["a", 80, ""]] };
    expect(() => mapRows(sheet, [0, 1, 1], false)).toThrow("不同");
    for (const score of [80, -1, "", "NaN"]) expect(() => mapRows({ ...sheet, rows: [["a", score, ""]] }, [0, 1, 2], false)).toThrow("0–10");
    expect(() => cellText({ formula: "1+1", result: 2 })).toThrow("公式");
    expect(() => cellText({ sharedFormula: "A1", result: 2 })).toThrow("公式");
    expect(() => mapRows({ ...sheet, rows: Array.from({ length: 51 }, () => ["a", 8, ""]) }, [0, 1, 2], false)).toThrow("50");
  });
  it("accepts ordinary XLSX and blocks truncated, encrypted and huge ZIP metadata before parsing", async () => {
    const book = new ExcelJS.Workbook(); book.addWorksheet("s").addRow(["a", 8, "note"]);
    const bytes = await book.xlsx.writeBuffer(); const buffer = new Uint8Array(bytes).buffer;
    expect(() => validateWorkbookZip(buffer)).not.toThrow();
    expect(() => validateWorkbookZip(buffer.slice(0, 40))).toThrow();
    for (const field of ["size", "encrypted"]) {
      const modified = buffer.slice(0); const view = new DataView(modified);
      for (let offset = 0; offset < modified.byteLength - 46; offset++) if (view.getUint32(offset, true) === 0x02014b50) {
        if (field === "size") view.setUint32(offset + 24, 21 * 1024 * 1024, true); else view.setUint16(offset + 8, 1, true);
        break;
      }
      expect(() => validateWorkbookZip(modified)).toThrow();
    }
  });
});
it("only automatically matches a unique exact alias in a complete result page", () => {
  const candidate: EntitySummary = { id: "v1", type: "vn", image: null, name: { primary: "中文名", original: null, romanized: "Original", alternatives: ["Alias"] } };
  expect(exactMatch(" alias ", [candidate])?.id).toBe("v1");
  expect(exactMatch("ali", [candidate])).toBeUndefined();
  expect(exactMatch("Alias", [candidate, { ...candidate, id: "v2" }])).toBeUndefined();
  expect(exactMatch("Alias", [candidate], true)).toBeUndefined();
});
it("moves up/down by actual position and replays reference +0.1 without mutating originals", () => {
  const entries: RankingEntry[] = [8.25, 8, 7].map((score, index) => ({ id: String(index), name: String(index), vnId: null, image: null, vndbRating: null, seedScore: score, averageScore: null, scoreCount: 0, sortScore: null, contributions: [] }));
  const up = moveEntry(entries, "2", 1);
  expect(up.map((entry) => entry.id)).toEqual(["2", "0", "1"]);
  expect(up[0]!.sortScore).toBe(8.35);
  const down = moveEntry(up, "2", 3);
  expect(down.map((entry) => entry.id)).toEqual(["0", "1", "2"]);
  expect(down[2]!.sortScore).toBe(8.1);
  expect(entries[2]!.sortScore).toBeNull();
  expect(moveEntry(entries, "0", 1)).toBe(entries);
  expect(moveEntry(entries, "0", 0)).toBe(entries);
});
