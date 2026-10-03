import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { automaticOrder, effectiveScore, invalid, RankingError, RankingStore, type RankingBoard, type RankingEntry, type RankingRow } from "./ranking-store.js";
import { fields, mapVnSummary, type RawVn, type VndbClient } from "./vndb.js";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number, min = 1): string {
  if (typeof value !== "string" || value.trim().length < min || value.length > max) invalid();
  return value.trim();
}
function version(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invalid(); return value; }
function rows(value: unknown): RankingRow[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) invalid();
  const seen = new Set<string>();
  return value.map((raw) => {
    const row = object(raw);
    const vnId = row.vnId === null ? null : string(row.vnId, 30);
    if (vnId && !/^v[1-9]\d*$/.test(vnId)) invalid();
    const entryId = row.entryId === undefined ? undefined : string(row.entryId, 100);
    const key = entryId ? `entry:${entryId}` : vnId;
    if (key && seen.has(key)) invalid("同一批次不能重复提交同一作品。 ");
    if (key) seen.add(key);
    if (typeof row.score !== "number" || !Number.isFinite(row.score) || row.score < 0 || row.score > 10) invalid("评分须为 0–10。 ");
    return { vnId, name: string(row.name, 300), score: row.score, extra: string(row.extra, 4000, 0), ...(entryId ? { entryId } : {}) };
  });
}
function token(request: FastifyRequest): string {
  return request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("gtool_session="))?.slice(14) ?? "";
}

export async function registerRankingRoutes(app: FastifyInstance, store: RankingStore, client: VndbClient) {
  const configuredOrigin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).origin : undefined;
  const cookie = (value: string, age: number) => `gtool_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
  await app.register(async (scope) => {
    scope.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
      const expected = configuredOrigin ?? `${request.protocol}://${request.host}`;
      if (request.headers["sec-fetch-site"] === "cross-site" || (request.headers.origin !== undefined && request.headers.origin !== expected)) throw new RankingError(403, "BAD_ORIGIN", "不允许跨站提交。 ");
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")) throw new RankingError(415, "JSON_REQUIRED", "请使用 JSON 提交。 ");
    });
    const requireUser = (request: FastifyRequest) => {
      const user = store.user(token(request));
      if (!user) throw new RankingError(401, "LOGIN_REQUIRED", "请先登录。 ");
      return user;
    };
    const hydrate = async (ids?: string[]): Promise<RankingEntry[]> => {
      if (ids?.length === 0) return [];
      const result = await client.query<RawVn & { rating?: number | null }>("/vn", {
        filters: ids ? (ids.length === 1 ? ["id", "=", ids[0]] : ["or", ...ids.map((id) => ["id", "=", id])]) : ["votecount", ">=", 100],
        fields: `${fields.vnSummary},rating`, sort: "rating", reverse: true, results: 50,
      }, 3600000, { priority: "normal" });
      return result.data.results.map((vn) => {
        const summary = mapVnSummary(vn);
        const rating = typeof vn.rating === "number" && Number.isFinite(vn.rating) ? vn.rating / 10 : null;
        return { id: randomUUID(), vnId: vn.id, name: summary.name.primary, image: summary.image, vndbRating: rating, seedScore: ids ? null : rating, averageScore: null, scoreCount: 0, sortScore: null, contributions: [] };
      });
    };
    scope.get("/auth/me", async (request) => ({ user: store.user(token(request)) }));
    for (const action of ["register", "login"] as const) {
      scope.post(`/auth/${action}`, async (request, reply) => {
        store.limit(`auth:${request.ip}`, 10, 60000);
        const body = object(request.body);
        const email = string(body.email, 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid("邮箱格式不正确。 ");
        if (typeof body.password !== "string" || body.password.length < 10 || body.password.length > 128) invalid("密码长度须为 10–128 个字符。 ");
        const user = action === "register" ? await store.register(email, body.password, string(body.displayName, 40)) : await store.login(email, body.password);
        store.logout(token(request));
        reply.header("Set-Cookie", cookie(store.session(user), 7 * 86400));
        return { user };
      });
    }
    scope.post("/auth/logout", async (request, reply) => { object(request.body); store.logout(token(request)); reply.header("Set-Cookie", cookie("", 0)); return { ok: true }; });
    scope.get("/rankings", async () => ({ items: store.list() }));
    scope.get("/rankings/vndb", async (): Promise<RankingBoard> => ({ id: "vndb", title: "VNDB 高分榜", ownerId: null, version: 0, mode: "auto", entries: (await hydrate()).map((entry) => ({ ...entry, id: entry.vnId! })) }));
    scope.get<{ Params: { id: string } }>("/rankings/:id", async (request) => store.get(request.params.id));
    scope.post("/rankings", async (request) => {
      const user = requireUser(request), body = object(request.body);
      const title = string(body.title, 100);
      if (body.source !== "empty" && body.source !== "vndb") invalid();
      store.limit(`create:${user.id}`, 10, 3600000);
      return store.create(title, user, body.source === "vndb" ? await hydrate() : []);
    });
    scope.post("/ranking-imports", async (request) => { object(request.body); return store.reserve(requireUser(request), request.ip); });
    scope.post<{ Params: { id: string } }>("/rankings/:id/contributions", async (request) => {
      const user = requireUser(request), body = object(request.body), submitted = rows(body.rows), expectedVersion = version(body.version);
      const importId = body.importId === undefined ? undefined : string(body.importId, 100);
      if (submitted.length > 1 && !importId) invalid("批量提交须先申请导入凭证。 ");
      if (importId) store.checkImport(importId, user.id);
      const existing = store.get(request.params.id);
      if (existing.version !== expectedVersion) throw new RankingError(409, "VERSION_CONFLICT", "榜单已更新，请刷新后重新提交。 ");
      const newIds = [...new Set(submitted.flatMap((row) => row.vnId && !existing.entries.some((entry) => entry.vnId === row.vnId) ? [row.vnId] : []))];
      const snapshots = await hydrate(newIds);
      if (newIds.some((id) => !snapshots.some((entry) => entry.vnId === id))) invalid("部分 VNDB 作品不存在，请重新匹配。 ");
      return store.mutate(request.params.id, expectedVersion, user, false, (board) => {
        const touched = new Set<string>();
        for (const row of submitted) {
          let entry = row.entryId ? board.entries.find((item) => item.id === row.entryId) : row.vnId ? board.entries.find((item) => item.vnId === row.vnId) : undefined;
          if (row.entryId && (!entry || entry.vnId !== row.vnId)) invalid("不能更改已有条目的作品关联。 ");
          if (!entry) {
            entry = row.vnId ? structuredClone(snapshots.find((item) => item.vnId === row.vnId)!) : { id: randomUUID(), vnId: null, name: row.name, image: null, vndbRating: null, seedScore: null, averageScore: null, scoreCount: 0, sortScore: null, contributions: [] };
            board.entries.push(entry);
          }
          if (touched.has(entry.id)) invalid("同一批次不能重复提交同一作品。 ");
          touched.add(entry.id);
          entry.contributions = entry.contributions.filter((vote) => vote.userId !== user.id);
          entry.contributions.push({ userId: user.id, displayName: user.displayName, score: row.score, extra: row.extra });
          entry.scoreCount = entry.contributions.length;
          entry.averageScore = entry.contributions.reduce((sum, vote) => sum + vote.score, 0) / entry.scoreCount;
        }
        if (board.mode === "auto") automaticOrder(board);
      }, importId);
    });
    scope.put<{ Params: { id: string } }>("/rankings/:id/order", async (request) => {
      const user = requireUser(request), body = object(request.body), expectedVersion = version(body.version);
      if (!Array.isArray(body.moves) || !body.moves.length || body.moves.length > 500) invalid();
      const moves = body.moves.map((raw) => { const move = object(raw); return { entryId: string(move.entryId, 100), position: version(move.position) }; });
      return store.mutate(request.params.id, expectedVersion, user, true, (board) => {
        for (const move of moves) {
          const index = board.entries.findIndex((entry) => entry.id === move.entryId);
          if (index < 0 || move.position > board.entries.length) invalid();
          if (index === move.position - 1) continue;
          const target = board.entries[move.position - 1]!;
          const reference = target.sortScore ?? effectiveScore(target) ?? 0;
          const [entry] = board.entries.splice(index, 1);
          entry!.sortScore = Math.round((reference + 0.1) * 1000000) / 1000000;
          board.entries.splice(move.position - 1, 0, entry!);
        }
        board.mode = "manual";
      });
    });
    scope.post<{ Params: { id: string } }>("/rankings/:id/reset-order", async (request) => {
      const user = requireUser(request), body = object(request.body);
      return store.mutate(request.params.id, version(body.version), user, true, (board) => { board.mode = "auto"; board.entries.forEach((entry) => { entry.sortScore = null; }); automaticOrder(board); });
    });
    scope.delete<{ Params: { id: string; entryId: string } }>("/rankings/:id/entries/:entryId", async (request) => {
      const user = requireUser(request), body = object(request.body);
      return store.mutate(request.params.id, version(body.version), user, true, (board) => { const index = board.entries.findIndex((entry) => entry.id === request.params.entryId); if (index < 0) throw new RankingError(404, "NOT_FOUND", "作品不存在。 "); board.entries.splice(index, 1); });
    });
  }, { prefix: "/api/v1" });
}
