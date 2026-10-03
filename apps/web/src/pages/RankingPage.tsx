import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EntityImage } from "../components";
import { Account } from "../ranking/Account";
import { ContributionForm } from "../ranking/ContributionForm";
import { ExcelImport } from "../ranking/ExcelImport";
import { Contributions } from "../ranking/Contributions";
import { boardPath, rankingApi, type Board, type BoardSummary, type RankingEntry, type RankingRow, type RankingUser } from "../ranking/api";
import { moveEntry } from "../ranking/model";
import "../ranking/ranking.css";

export function RankingPage() {
  const [params, setParams] = useSearchParams();
  const id = params.get("board") || "vndb";
  const client = useQueryClient();
  const account = useQuery({ queryKey: ["ranking-user"], queryFn: ({ signal }) => rankingApi<{ user: RankingUser | null }>("/auth/me", "GET", undefined, signal), staleTime: 0 });
  const boards = useQuery({ queryKey: ["rankings"], queryFn: ({ signal }) => rankingApi<{ items: BoardSummary[] }>("/rankings", "GET", undefined, signal) });
  const board = useQuery({ queryKey: ["ranking", id], queryFn: ({ signal }) => rankingApi<Board>(boardPath(id), "GET", undefined, signal) });
  return <section className="ranking-page" aria-labelledby="ranking-title"><header className="page-heading ranking-heading"><p className="eyebrow">Ranking cabinet / 003</p><h1 id="ranking-title">Gal 排行</h1><p>从 VNDB 出发，收集每个人的评价，排出你的作品清单。</p></header>
    {account.isError ? <p role="alert">账号状态加载失败。<button onClick={() => account.refetch()}>重试</button></p> : <Account user={account.data?.user ?? null} onChange={(user) => client.setQueryData(["ranking-user"], { user })} />}
    <nav className="ranking-board-nav" aria-label="选择榜单"><label>查看榜单<select value={id} onChange={(event) => setParams({ board: event.target.value })}><option value="vndb">VNDB 公共榜 · Top 50</option>{boards.data?.items.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.entryCount} 项</option>)}{id !== "vndb" && !boards.data?.items.some((item) => item.id === id) && <option value={id}>{board.data?.title ?? "当前榜单"}</option>}</select></label><button onClick={() => { void board.refetch(); void boards.refetch(); }}>刷新榜单</button></nav>
    {boards.isError && <p role="alert">榜单目录加载失败。<button onClick={() => boards.refetch()}>重试</button></p>}
    {account.data?.user && <CreateBoard onCreate={(created) => { client.setQueryData(["ranking", created.id], created); void client.invalidateQueries({ queryKey: ["rankings"] }); setParams({ board: created.id }); }} />}
    {board.isPending ? <p role="status">正在加载榜单快照…</p> : board.isError ? <p role="alert">{board.error.message}<button onClick={() => board.refetch()}>重试</button></p> : <BoardEditor key={`${id}:${account.data?.user?.id ?? "anonymous"}`} board={board.data} user={account.data?.user ?? null} update={(next) => { client.setQueryData(["ranking", id], next); void client.invalidateQueries({ queryKey: ["rankings"] }); }} reload={() => board.refetch()} />}
  </section>;
}

function CreateBoard({ onCreate }: { onCreate: (board: Board) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <details className="ranking-panel"><summary>创建自定义榜单</summary><form className="ranking-form" onSubmit={async (event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError("");
    try { onCreate(await rankingApi<Board>("/rankings", "POST", { title: data.get("title"), source: data.get("source") === "vndb" ? "vndb" : "empty" })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}><label>榜单名称<input name="title" required maxLength={100} /></label><label>初始化来源<select name="source"><option value="vndb">VNDB Top 50（至少 100 票）</option><option value="excel">Excel（先创建空榜，再导入）</option><option value="empty">空榜，手动搜索添加</option></select></label><button disabled={busy}>{busy ? "创建中…" : "创建榜单"}</button></form>{error && <p role="alert">{error}</p>}</details>;
}

function BoardEditor({ board, user, update, reload }: { board: Board; user: RankingUser | null; update: (board: Board) => void; reload: () => unknown }) {
  const [editor, setEditor] = useState<string | null>(null);
  const [preview, setPreview] = useState<RankingEntry[] | null>(null);
  const [moves, setMoves] = useState<{ entryId: string; position: number }[]>([]);
  const [baseVersion, setBaseVersion] = useState(board.version);
  const [dragged, setDragged] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const owner = Boolean(user && board.ownerId === user.id);
  const custom = board.id !== "vndb";
  const entries = preview ?? board.entries;
  async function mutate(path: string, method: string, body: unknown) {
    setBusy(true); setError("");
    try { const next = await rankingApi<Board>(`${boardPath(board.id)}${path}`, method, body); update(next); return true; }
    catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  }
  function move(entryId: string, position: number) {
    const next = moveEntry(entries, entryId, position);
    if (next !== entries) { setPreview(next); setMoves([...moves, { entryId, position }]); }
  }
  const submit = (rows: RankingRow[], importId?: string) => mutate("/contributions", "POST", { version: board.version, rows, importId });
  const editingEntry = board.entries.find((item) => item.id === editor);
  return <div className="ranking-board"><header className="ranking-board-heading"><div><h2>{board.title}</h2><p>{entries.length} 部作品 · {board.mode === "manual" ? "手动顺序" : "自动排序"}{!custom && " · VNDB 评分 / 至少 100 票"}</p></div>
    {custom && user && !preview && <div className="ranking-actions"><button disabled={busy} onClick={() => setEditor("add")}>搜索并评分</button><button disabled={busy} onClick={() => setEditor("import")}>导入 Excel</button>{owner && <button disabled={busy} onClick={() => { setEditor(null); setPreview(board.entries); setMoves([]); setBaseVersion(board.version); }}>编辑顺序</button>}</div>}
    {custom && !user && <p>登录后即可贡献评分。榜单公开可读。</p>}
  </header>
    {error && <div role="alert"><p>{error}</p><button disabled={busy} onClick={() => reload()}>重新加载最新版本（保留输入）</button></div>}
    {preview && owner && <div className="ranking-panel"><p>拖动条目或输入目标名次。实际顺序优先；参考分为目标原分 +0.1，不改变用户评分。</p>{board.version !== baseVersion && <p role="alert">编辑期间榜单已更新，请取消排序预览后基于最新榜单重新排列。</p>}<div className="ranking-actions"><button disabled={busy || !moves.length || board.version !== baseVersion} onClick={async () => { if (await mutate("/order", "PUT", { version: baseVersion, moves })) { setPreview(null); setMoves([]); } }}>保存排序</button><button disabled={busy} onClick={() => { setPreview(null); setMoves([]); }}>取消排序预览</button><button disabled={busy} onClick={async () => { if (await mutate("/reset-order", "POST", { version: board.version })) { setPreview(null); setMoves([]); } }}>恢复自动排序</button></div></div>}
    {custom && user && editor === "import" && <ExcelImport busy={busy} onSubmit={submit} onClose={() => setEditor(null)} />}
    {custom && user && (editor === "add" || editingEntry) && <ContributionForm key={editor} entry={editingEntry} own={editingEntry?.contributions.find((item) => item.userId === user.id)} busy={busy} onSubmit={submit} onCancel={() => setEditor(null)} />}
    {!entries.length && <p className="ranking-panel">榜单还是空的。导入 Excel 或搜索第一部作品。</p>}
    <ol className="ranking-queue">{entries.map((entry, index) => <li key={entry.id} draggable={Boolean(preview && owner && !busy)} onDragStart={(event) => { event.dataTransfer.setData("text/plain", entry.id); setDragged(entry.id); }} onDragOver={(event) => { if (preview && owner) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (preview && owner && !busy && dragged) move(dragged, index + 1); setDragged(""); }} onDragEnd={() => setDragged("")}>
      <span className="ranking-number">{String(index + 1).padStart(2, "0")}</span><EntityImage image={entry.image} alt="" compact />
      <div className="ranking-entry-copy">{entry.vnId ? <Link to={`/knowledge/vn/${entry.vnId}?board=${encodeURIComponent(board.id)}`}>{entry.name}</Link> : <strong>{entry.name}</strong>}<small>{entry.vnId ?? "未关联 VNDB"} · VNDB {entry.vndbRating?.toFixed(2) ?? "—"}</small>{!entry.vnId && <details><summary>查看评分与评价</summary><Contributions entry={entry} /></details>}</div>
      <div className="ranking-score"><strong>{(entry.averageScore ?? entry.seedScore)?.toFixed(2) ?? "—"}</strong><small>{entry.scoreCount ? `${entry.scoreCount} 人均分` : entry.seedScore !== null ? "VNDB 初始分" : "尚无评分"}</small>{(preview || board.mode === "manual") && <small>排序参考 {entry.sortScore ?? "—"}</small>}</div>
      {preview && owner ? <form className="ranking-position" onSubmit={(event) => { event.preventDefault(); move(entry.id, Number(new FormData(event.currentTarget).get("position"))); }}><label>目标名次<input key={`${index}-${moves.length}`} name="position" aria-label={`${entry.name} 的目标名次`} type="number" min={1} max={entries.length} defaultValue={index + 1} required /></label><button disabled={busy}>移动</button></form> : custom && user ? <div className="ranking-actions"><button disabled={busy} onClick={() => setEditor(entry.id)}>我的评分</button>{owner && <button disabled={busy} onClick={() => { if (window.confirm(`移除「${entry.name}」及此榜单中它的所有评价？此操作不可撤销。`)) void mutate(`/entries/${encodeURIComponent(entry.id)}`, "DELETE", { version: board.version }); }}>移除</button>}</div> : null}
    </li>)}</ol>
  </div>;
}
