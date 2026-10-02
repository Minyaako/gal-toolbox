import { ApiError, type EntityImage } from "../api";

export type RankingUser = { id: string; email: string; displayName: string; emailVerified: false };
export type Contribution = { userId: string; displayName: string; score: number; extra: string };
export type RankingEntry = { id: string; vnId: string | null; name: string; image: EntityImage; vndbRating: number | null; seedScore: number | null; averageScore: number | null; scoreCount: number; sortScore: number | null; contributions: Contribution[] };
export type Board = { id: string; title: string; ownerId: string | null; version: number; mode: "auto" | "manual"; entries: RankingEntry[] };
export type BoardSummary = Omit<Board, "entries"> & { entryCount: number };
export type RankingRow = { vnId: string | null; name: string; score: number; extra: string; entryId?: string };
export async function rankingApi<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { method, credentials: "same-origin", signal, headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const retry = response.headers.get("Retry-After");
    throw new ApiError(data.error?.code === "VERSION_CONFLICT" ? "榜单已被其他人更新。你的输入已保留，请重新加载榜单后确认并提交。" : `${data.error?.message ?? "请求失败，请重试。"}${retry ? `（${retry} 秒后重试）` : ""}`, response.status, data.error?.code ?? "UNKNOWN");
  }
  return response.json();
}
export const boardPath = (id: string) => `/rankings/${encodeURIComponent(id)}`;
