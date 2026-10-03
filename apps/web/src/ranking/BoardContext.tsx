import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { boardPath, rankingApi, type Board } from "./api";
import { Contributions } from "./Contributions";
import "./ranking.css";
export function BoardContext({ vnId }: { vnId: string }) {
  const [params] = useSearchParams(); const id = params.get("board");
  const query = useQuery({ queryKey: ["ranking", id], queryFn: ({ signal }) => rankingApi<Board>(boardPath(id!), "GET", undefined, signal), enabled: Boolean(id) });
  if (!id) return null;
  const entry = query.data?.entries.find((item) => item.vnId === vnId);
  return <section className="ranking-panel"><h2>榜单评分与评价</h2><Link to={`/ranking?board=${encodeURIComponent(id)}`}>← 返回 {query.data?.title ?? "榜单"}</Link>{query.isPending ? <p role="status">正在读取评价…</p> : query.isError ? <p role="alert">{query.error.message}<button onClick={() => query.refetch()}>重试</button></p> : entry ? <Contributions entry={entry} /> : <p>此作品已不在该榜单中。</p>}</section>;
}
