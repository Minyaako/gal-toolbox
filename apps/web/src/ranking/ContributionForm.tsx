import { useEffect, useRef, useState } from "react";
import { getSearchPage, type EntitySummary } from "../api";
import type { RankingEntry, RankingRow } from "./api";

export function ContributionForm({ entry, own, busy, onSubmit, onCancel }: { entry?: RankingEntry; own?: { score: number; extra: string }; busy: boolean; onSubmit: (rows: RankingRow[]) => Promise<boolean>; onCancel: () => void }) {
  const [name, setName] = useState(entry?.name ?? "");
  const [selected, setSelected] = useState<EntitySummary>();
  const [results, setResults] = useState<EntitySummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return <section className="ranking-panel" aria-label="编辑我的评分"><h3>{entry ? `评价 ${entry.name}` : "搜索并添加作品"}</h3>
    {!entry && <form className="ranking-form" onSubmit={async (event) => {
      event.preventDefault(); controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setSearching(true); setError(""); setSelected(undefined);
      try { const data = await getSearchPage("vn", name, 1, 12, { signal: abort.signal, priority: "high" }); setResults(data.items); if (!data.items.length) setError("没有找到作品，请修改名称重新搜索。"); }
      catch (e) { if (!abort.signal.aborted) setError((e as Error).message); } finally { if (!abort.signal.aborted) setSearching(false); }
    }}><label>作品名称<input required value={name} onChange={(e) => { setName(e.target.value); setSelected(undefined); }} /></label><button disabled={searching}>{searching ? "搜索中…" : "搜索 VNDB"}</button></form>}
    {!entry && <div className="ranking-candidates">{results.map((item) => <button key={item.id} aria-pressed={selected?.id === item.id} onClick={() => setSelected(item)}>{item.name.primary} · {item.id}</button>)}</div>}
    <form className="ranking-form" onSubmit={async (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      if (!entry && !selected) { setError("请先从搜索结果中选择作品。"); return; }
      if (await onSubmit([{ entryId: entry?.id, vnId: entry?.vnId ?? selected?.id ?? null, name: entry?.name ?? selected!.name.primary, score: Number(data.get("score")), extra: String(data.get("extra")) }])) onCancel();
    }}>
      <label>我的评分（0–10）<input name="score" type="number" min="0" max="10" step="any" required defaultValue={own?.score ?? ""} /></label>
      <label className="ranking-wide">extra 评价<textarea name="extra" maxLength={4000} defaultValue={own?.extra ?? ""} /></label>
      <button disabled={busy || (!entry && !selected)}>{busy ? "提交中…" : "提交我的评分"}</button><button type="button" disabled={busy} onClick={onCancel}>取消</button>
    </form>{error && <p role="alert">{error}</p>}
  </section>;
}
