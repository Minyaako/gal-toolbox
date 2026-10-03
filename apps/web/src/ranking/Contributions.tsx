import type { RankingEntry } from "./api";
export function Contributions({ entry }: { entry: RankingEntry }) {
  return entry.contributions.length ? <ul className="ranking-reviews">{entry.contributions.map((item) => <li key={item.userId}><strong>{item.displayName} · {item.score} 分</strong><p>{item.extra || "暂无额外评价"}</p></li>)}</ul> : <p>暂无用户评价。</p>;
}
