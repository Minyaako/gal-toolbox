import { useEffect, useRef, useState } from "react";
import { getSearchPage, type EntitySummary } from "../api";
import { rankingApi, type RankingRow } from "./api";
import { exactMatch, mapRows, validateWorkbookZip, type SheetData } from "./model";

type MatchRow = { row: RankingRow; query: string; candidates: EntitySummary[]; status: string; resolved: boolean };
export function ExcelImport({ busy, onSubmit, onClose }: { busy: boolean; onSubmit: (rows: RankingRow[], importId: string) => Promise<boolean>; onClose: () => void }) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [columns, setColumns] = useState([0, 1, 2]);
  const [header, setHeader] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [importId, setImportId] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const sheet = sheets[sheetIndex];
  async function reserve(signal?: AbortSignal) {
    const reservation = await rankingApi<{ importId: string; expiresAt: number }>("/ranking-imports", "POST", {}, signal);
    setImportId(reservation.importId); setExpiresAt(reservation.expiresAt);
    return reservation.importId;
  }
  function change(index: number, update: Partial<MatchRow>) { setRows((previous) => previous.map((row, i) => i === index ? { ...row, ...update } : row)); }
  async function match(index: number, item: MatchRow, signal: AbortSignal) {
    change(index, { status: "搜索中…" });
    try {
      const data = await getSearchPage("vn", item.query, 1, 12, { signal, priority: "high" });
      if (signal.aborted) return;
      const chosen = exactMatch(item.query, data.items, data.more);
      change(index, { candidates: data.items, row: { ...item.row, vnId: chosen?.id ?? null }, resolved: Boolean(chosen), status: chosen ? `已匹配 ${chosen.name.primary}` : data.items.length ? "请明确选择候选；可修改名称重新搜索" : "未找到作品，请重试或保留原名称" });
    } catch (e) { if (!signal.aborted) change(index, { status: (e as Error).message, resolved: false }); }
  }
  return <section className="ranking-panel" aria-label="Excel 导入"><h3>导入 Excel</h3><p>.xlsx · 最多 5 MiB / 50 行 · 按 IP 每 60 秒一次。文件在浏览器解析，仅提交选定三列。公式不受支持。</p>
    {!rows.length && <>
      <label>选择 Excel 文件<input type="file" accept=".xlsx" disabled={working} onChange={async (event) => {
        const file = event.target.files?.[0]; if (!file) return;
        controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
        setError(""); setSheets([]); setConfirmed(false); setWorking(true);
        try {
          if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 5 * 1024 * 1024) throw new Error("请选择不超过 5 MiB 的 .xlsx 文件；.xls 请先另存为 .xlsx。");
          const bytes = await file.arrayBuffer(); validateWorkbookZip(bytes);
          const ExcelJS = await import("exceljs"); const book = new ExcelJS.default.Workbook();
          await book.xlsx.load(bytes);
          const parsed = book.worksheets.map((worksheet) => {
            if (worksheet.rowCount > 1000 || worksheet.columnCount > 100) throw new Error("工作表范围过大，请仅保留需要导入的表格（最多 1000 行、100 列）。");
            const values: unknown[][] = []; worksheet.eachRow({ includeEmpty: true }, (row) => { values.push(Array.from({ length: worksheet.columnCount }, (_, column) => row.getCell(column + 1).value)); });
            return { name: worksheet.name, rows: values };
          });
          if (!parsed.length) throw new Error("工作簿没有工作表。");
          if (mounted.current && !abort.signal.aborted) { setSheets(parsed); setSheetIndex(0); }
        } catch (e) { if (mounted.current && !abort.signal.aborted) setError((e as Error).message); } finally { if (mounted.current && controller.current === abort) setWorking(false); }
      }} /></label>
      {sheet && <div className="ranking-form"><label>工作表<select value={sheetIndex} onChange={(event) => setSheetIndex(Number(event.target.value))}>{sheets.map((item, index) => <option key={index} value={index}>{item.name}</option>)}</select></label>
        {["作品名称列", "评分列", "extra 评价列"].map((label, index) => <label key={label}>{label}<select value={columns[index]} onChange={(event) => setColumns(columns.map((value, i) => i === index ? Number(event.target.value) : value))}>{Array.from({ length: Math.max(3, ...sheet.rows.map((row) => row.length)) }, (_, column) => <option key={column} value={column}>第 {column + 1} 列</option>)}</select></label>)}
        <label className="ranking-check"><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />第一行为表头</label>
        <label className="ranking-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />我确认评分已采用 0–10 分制，不需要换算</label>
        <button disabled={working || !confirmed} onClick={async () => {
          setError(""); const abort = new AbortController(); controller.current = abort;
          try {
            const mapped = mapRows(sheet, columns, header).map((row) => ({ row, query: row.name, candidates: [], resolved: false, status: "等待搜索" }));
            setWorking(true);
            await reserve(abort.signal); setRows(mapped);
            for (let index = 0; index < mapped.length && !abort.signal.aborted; index++) await match(index, mapped[index]!, abort.signal);
          } catch (e) { if (!abort.signal.aborted) setError((e as Error).message); } finally { if (mounted.current && controller.current === abort) setWorking(false); }
        }}>确认列并开始匹配</button>
      </div>}
    </>}
    {rows.length > 0 && <><p role="status">已确认 {rows.filter((item) => item.resolved).length} / {rows.length} 项。提交前请检查重复匹配和评分。</p>
      <p>导入凭证有效至 {new Date(expiresAt).toLocaleTimeString()}。过期后重新申请即可保留全部匹配结果。</p>
      <button disabled={working || busy} onClick={async () => { setWorking(true); setError(""); try { await reserve(); } catch (e) { setError((e as Error).message); } finally { if (mounted.current) setWorking(false); } }}>重新申请导入凭证</button>
      <ol className="ranking-import-rows">{rows.map((item, index) => <li key={index}><strong>{item.row.name} · {item.row.score} 分</strong><p>{item.status}</p>
        <label>重新搜索名称<input value={item.query} disabled={working || busy} onChange={(event) => change(index, { query: event.target.value })} /></label>
        <div className="ranking-actions"><button disabled={working || busy || !item.query.trim()} onClick={async () => { const abort = new AbortController(); controller.current = abort; setWorking(true); await match(index, item, abort.signal); if (mounted.current && controller.current === abort) setWorking(false); }}>重新搜索</button>
          <button disabled={working || busy} onClick={() => change(index, { row: { ...item.row, vnId: null }, resolved: true, status: "已确认：保留原名称，无 VNDB 关联" })}>保留原名称提交</button></div>
        <div className="ranking-candidates">{item.candidates.map((candidate) => <button disabled={working || busy} key={candidate.id} aria-pressed={item.row.vnId === candidate.id} onClick={() => change(index, { row: { ...item.row, vnId: candidate.id }, resolved: true, status: `已选择 ${candidate.name.primary}` })}>{candidate.name.primary} · {candidate.id}</button>)}</div>
      </li>)}</ol>
      <button disabled={working || busy || rows.some((row) => !row.resolved)} onClick={async () => {
        setError(""); const ids = rows.map((item) => item.row.vnId).filter(Boolean);
        if (Date.now() >= expiresAt) { setError("导入凭证已过期。请重新申请导入凭证；匹配结果已保留，无需再次搜索。"); return; }
        if (new Set(ids).size !== ids.length) { setError("多个 Excel 行匹配到了同一作品，请修正匹配或重新导入去重后的文件。"); return; }
        if (await onSubmit(rows.map((item) => item.row), importId)) onClose();
      }}>{busy ? "提交中…" : "提交全部作品"}</button>
    </>}
    <div className="ranking-actions">{working && <button onClick={() => { controller.current?.abort(); setWorking(false); setError("匹配已取消，已完成结果保留。未完成项可逐项重试。"); }}>停止匹配</button>}<button disabled={busy} onClick={() => { controller.current?.abort(); onClose(); }}>关闭导入</button></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
