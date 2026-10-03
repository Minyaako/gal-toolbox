import type { EntitySummary } from "../api";
import type { RankingEntry, RankingRow } from "./api";

export type SheetData = { name: string; rows: unknown[][] };
export function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && ("formula" in value || "sharedFormula" in value)) throw new Error("包含公式单元格，请粘贴为值后重新导入。");
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) return value.richText.map((part: { text: string }) => part.text).join("");
  throw new Error("包含不支持的单元格类型，请转换为文本或数字。");
}
export function mapRows(sheet: SheetData, columns: number[], header: boolean): RankingRow[] {
  if (columns.length !== 3 || new Set(columns).size !== 3) throw new Error("请选择三个不同的列。");
  const rows: RankingRow[] = [];
  sheet.rows.slice(header ? 1 : 0).forEach((cells, index) => {
    const [name = "", rawScore = "", extra = ""] = columns.map((column) => cellText(cells[column]).trim());
    if (!name && !rawScore && !extra) return;
    if (!name || name.length > 300 || !rawScore || !Number.isFinite(Number(rawScore)) || Number(rawScore) < 0 || Number(rawScore) > 10) throw new Error(`第 ${index + (header ? 2 : 1)} 行名称或评分无效：名称不超过 300 字，评分必须为 0–10。`);
    if (extra.length > 4000) throw new Error(`第 ${index + 1} 行评价过长（最多 4000 字）。`);
    rows.push({ name, score: Number(rawScore), extra, vnId: null });
  });
  if (!rows.length || rows.length > 50) throw new Error("每次导入需要 1–50 行作品。");
  return rows;
}
const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
export function exactMatch(name: string, candidates: EntitySummary[], more = false): EntitySummary | undefined {
  if (more) return undefined;
  const matches = candidates.filter((item) => [item.name.primary, item.name.original, item.name.romanized, ...item.name.alternatives].some((alias) => alias && normalize(alias) === normalize(name)));
  return matches.length === 1 ? matches[0] : undefined;
}
export function moveEntry(entries: RankingEntry[], entryId: string, position: number): RankingEntry[] {
  const source = entries.findIndex((entry) => entry.id === entryId);
  if (source < 0 || !Number.isInteger(position) || position < 1 || position > entries.length || source === position - 1) return entries;
  const target = entries[position - 1]!;
  const moved = { ...entries[source]!, sortScore: Number(((target.sortScore ?? target.averageScore ?? target.seedScore ?? 0) + 0.1).toFixed(6)) };
  const next = entries.filter((entry) => entry.id !== entryId);
  next.splice(position - 1, 0, moved);
  return next;
}

// Inspect ZIP metadata before ExcelJS inflates the workbook. Do not trust MIME or extension.
export function validateWorkbookZip(buffer: ArrayBuffer): void {
  const view = new DataView(buffer);
  const fail = () => { throw new Error("Excel 压缩包无效或解压后过大（最大 20 MiB），请重新导出精简的 .xlsx。"); };
  let end = -1;
  for (let offset = buffer.byteLength - 22; offset >= Math.max(0, buffer.byteLength - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === buffer.byteLength) { end = offset; break; }
  }
  if (end < 0) return fail();
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (!count || count > 1000 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || start + size !== end) return fail();
  let offset = start, expanded = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) return fail();
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true), compressed = view.getUint32(offset + 20, true), uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true), local = view.getUint32(offset + 42, true);
    expanded += uncompressed;
    if ((flags & 1) || ![0, 8].includes(method) || compressed === 0xffffffff || uncompressed === 0xffffffff || expanded > 20 * 1024 * 1024 || local + 30 > start || offset + 46 + nameLength + extraLength + commentLength > end) return fail();
    if (view.getUint32(local, true) !== 0x04034b50 || local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true) + compressed > start) return fail();
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== end) fail();
}
