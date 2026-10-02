import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { CacheStore } from "./cache.js";
import { RankingStore, type RankingBoard } from "./ranking-store.js";
import { VndbClient } from "./vndb.js";

const cleanup: (() => unknown)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
async function fixture(trustProxy?: string) {
  const cache = new CacheStore(":memory:");
  let now = Date.now();
  const store = new RankingStore(":memory:", () => now);
  let queries = 0;
  const client = new VndbClient(cache, (async (_url, init) => {
    queries++;
    const { filters } = JSON.parse(String(init?.body));
    const ids: string[] = filters[0] === "id" ? [filters[2]] : filters[0] === "or" ? filters.slice(1).map((filter: unknown[]) => { expect(filter.slice(0, 2)).toEqual(["id", "="]); expect(typeof filter[2]).toBe("string"); return filter[2]; }) : ["v1", "v2"];
    ids.forEach((id) => expect(typeof id).toBe("string"));
    return new Response(JSON.stringify({ results: ids.filter((id) => id !== "v999").map((id) => ({ id, title: id, titles: [{ lang: "zh-Hans", title: `中文${id}` }], rating: id === "v1" ? 90.5 : 82.5 })), more: false }));
  }) as typeof fetch, 0);
  const app = await buildApp({ cache, rankingStore: store, client, ...(trustProxy === undefined ? {} : { trustProxy }) });
  cleanup.push(() => app.close(), () => cache.close(), () => store.close());
  const send = async (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown, cookie = "", extra: Record<string, string> = {}) => app.inject({ method, url: `/api/v1${url}`, headers: { cookie, ...extra }, ...(payload === undefined ? {} : { payload }) });
  const register = async (name: string) => {
    const response = await send("POST", "/auth/register", { email: `${name}@example.com`, password: "safe-password-123", displayName: name });
    expect(response.statusCode).toBe(200);
    return { user: response.json().user, cookie: String(response.headers["set-cookie"]).split(";")[0]! };
  };
  return { app, store, send, register, queries: () => queries, advance: (ms: number) => { now += ms; } };
}
const row = (vnId: string | null, score: number, extra = "评价") => ({ vnId, name: "不可信客户端名", score, extra });

describe("shared rankings API", () => {
  it("publishes the ranking/auth request contracts and mutation methods", async () => {
    const f = await fixture();
    const spec = (await f.send("GET", "/openapi.json")).json();
    expect(spec.info.version).toBe("1.4.0");
    expect(spec.paths["/rankings/{id}/order"].put.requestBody.content["application/json"].schema.required).toEqual(["version", "moves"]);
    expect(spec.components.schemas.RankingEntry.properties.contributions.items.$ref).toBe("#/components/schemas/RankingContribution");
    expect(spec.components.securitySchemes.rankingSession.name).toBe("gtool_session");
    const docs = await f.app.inject({ url: "/api/docs" });
    expect(docs.body).toContain("POST /api/v1/auth/register");
    expect(docs.body).toContain("DELETE /api/v1/rankings/{id}/entries/{entryId}");
  });
  it("authenticates securely, rotates sessions, rejects CSRF and keeps public data email-free", async () => {
    const f = await fixture();
    const user = await f.register("owner");
    expect((await f.send("GET", "/auth/me", undefined, user.cookie)).json().user.email).toBe("owner@example.com");
    expect((await f.send("POST", "/rankings", { title: "榜", source: "empty" })).statusCode).toBe(401);
    expect((await f.send("POST", "/rankings", { title: "榜", source: "empty" }, user.cookie, { origin: "https://evil.test" })).statusCode).toBe(403);
    expect((await f.send("POST", "/auth/logout", "{}", user.cookie, { "content-type": "text/plain" })).statusCode).toBe(415);
    expect((await f.send("POST", "/auth/login", { email: "owner@example.com", password: "incorrect-pass" })).statusCode).toBe(401);
    const login = await f.send("POST", "/auth/login", { email: "OWNER@example.com", password: "safe-password-123" }, user.cookie);
    expect(login.headers["set-cookie"]).toContain("HttpOnly; SameSite=Strict");
    expect((await f.send("GET", "/auth/me", undefined, user.cookie)).json().user).toBeNull();
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    await f.send("POST", "/auth/logout", {}, cookie);
    expect((await f.send("GET", "/auth/me", undefined, cookie)).json().user).toBeNull();
    expect(login.headers["cache-control"]).toBe("no-store");
    const stored = f.store.database.prepare("SELECT salt,hash FROM ranking_users").get();
    expect(JSON.stringify(stored)).not.toContain("safe-password");
  });

  it("merges by VN ID, replaces own vote, preserves manual order and appends new works", async () => {
    const f = await fixture(), owner = await f.register("owner"), guest = await f.register("guest");
    let board = (await f.send("POST", "/rankings", { title: "榜", source: "vndb" }, owner.cookie)).json() as RankingBoard;
    expect(board.entries.map((entry) => entry.vndbRating)).toEqual([9.05, 8.25]);
    expect(board.entries[0]!.name).toBe("中文v1");
    const baseQueries = f.queries();
    await f.send("GET", `/rankings/${board.id}`);
    expect(f.queries()).toBe(baseQueries);
    const contribute = async (cookie: string, value: unknown) => {
      const response = await f.send("POST", `/rankings/${board.id}/contributions`, { version: board.version, rows: [value] }, cookie);
      expect(response.statusCode).toBe(200); board = response.json();
    };
    await contribute(owner.cookie, row("v1", 4, "甲"));
    await contribute(guest.cookie, row("v1", 8, "乙"));
    expect(board.entries.find((e) => e.vnId === "v1")).toMatchObject({ averageScore: 6, scoreCount: 2 });
    await contribute(owner.cookie, row("v1", 6, "新甲"));
    expect(board.entries.find((e) => e.vnId === "v1")).toMatchObject({ averageScore: 7, scoreCount: 2 });
    expect(JSON.stringify(board)).not.toContain("@example.com");
    const moved = board.entries.find((e) => e.vnId === "v1")!;
    expect((await f.send("PUT", `/rankings/${board.id}/order`, { version: board.version, moves: [{ entryId: moved.id, position: 1 }] }, guest.cookie)).statusCode).toBe(403);
    board = (await f.send("PUT", `/rankings/${board.id}/order`, { version: board.version, moves: [{ entryId: moved.id, position: 1 }] }, owner.cookie)).json();
    expect(board.entries[0]).toMatchObject({ vnId: "v1", sortScore: 8.35, averageScore: 7 });
    await contribute(guest.cookie, row("v1", 0));
    await contribute(guest.cookie, row("v3", 10));
    expect(board.entries.map((e) => e.vnId)).toEqual(["v1", "v2", "v3"]);
    const noop = await f.send("PUT", `/rankings/${board.id}/order`, { version: board.version, moves: [{ entryId: moved.id, position: 1 }] }, owner.cookie);
    board = noop.json(); expect(board.entries[0]!.sortScore).toBe(8.35);
    board = (await f.send("POST", `/rankings/${board.id}/reset-order`, { version: board.version }, owner.cookie)).json();
    expect(board.entries.map((e) => e.vnId)).toEqual(["v3", "v2", "v1"]);
    expect(board.entries.every((e) => e.sortScore === null)).toBe(true);
    expect((await f.send("DELETE", `/rankings/${board.id}/entries/${moved.id}`, { version: board.version }, guest.cookie)).statusCode).toBe(403);
    expect((await f.send("DELETE", `/rankings/${board.id}/entries/${moved.id}`, { version: board.version }, owner.cookie)).json().entries).toHaveLength(2);
  });

  it("reserves imports per socket IP, commits atomically, binds tokens and rejects replay/expiry", async () => {
    const f = await fixture(), owner = await f.register("owner"), guest = await f.register("guest");
    let board = (await f.send("POST", "/rankings", { title: "导入", source: "empty" }, owner.cookie)).json() as RankingBoard;
    const importId = (await f.send("POST", "/ranking-imports", {}, owner.cookie)).json().importId;
    const limited = await f.send("POST", "/ranking-imports", {}, guest.cookie, { "x-forwarded-for": "9.9.9.9" });
    expect(limited.statusCode).toBe(429); expect(limited.headers["retry-after"]).toBe("60");
    const path = `/rankings/${board.id}/contributions`;
    expect((await f.send("POST", path, { version: 1, rows: [row("v1", 8), row("v2", 7)] }, owner.cookie)).statusCode).toBe(400);
    expect((await f.send("POST", path, { version: 1, importId, rows: [row("v1", 8)] }, guest.cookie)).statusCode).toBe(400);
    expect((await f.send("POST", path, { version: 1, importId, rows: [row("v1", 8), row("v1", 7)] }, owner.cookie)).statusCode).toBe(400);
    expect((await f.send("POST", path, { version: 1, importId, rows: [row("v999", 8)] }, owner.cookie)).statusCode).toBe(400);
    board = (await f.send("POST", path, { version: 1, importId, rows: [row("v1", 8), row(null, 7)] }, owner.cookie)).json();
    expect(board.entries).toHaveLength(2);
    expect((await f.send("POST", path, { version: board.version, importId, rows: [row("v2", 8)] }, owner.cookie)).statusCode).toBe(400);
    const unmatched = board.entries.find((e) => !e.vnId)!;
    const update = await f.send("POST", path, { version: board.version, rows: [{ ...row(null, 10), entryId: unmatched.id }] }, guest.cookie);
    board = update.json(); expect(board.entries.find((e) => e.id === unmatched.id)?.scoreCount).toBe(2);
    expect((await f.send("POST", path, { version: board.version, rows: [{ ...row("v2", 10), entryId: unmatched.id }] }, guest.cookie)).statusCode).toBe(400);
    expect((await f.send("POST", path, { version: 1, rows: [row(null, 10)] }, owner.cookie)).statusCode).toBe(409);
    expect((await f.send("GET", `/rankings/${board.id}`)).json().entries).toHaveLength(2);
    f.advance(60000);
    const expired = (await f.send("POST", "/ranking-imports", {}, owner.cookie)).json().importId;
    f.advance(30 * 60000);
    expect((await f.send("POST", path, { version: board.version, importId: expired, rows: [row(null, 10)] }, owner.cookie)).statusCode).toBe(400);
  });

  it("rechecks versions after asynchronous hydration and validates rating bounds", async () => {
    const f = await fixture(), owner = await f.register("owner");
    const board = (await f.send("POST", "/rankings", { title: "并发", source: "empty" }, owner.cookie)).json();
    const results = await Promise.all(["v1", "v2"].map((id) => f.send("POST", `/rankings/${board.id}/contributions`, { version: 1, rows: [row(id, 8)] }, owner.cookie)));
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    for (const score of [-1, 10.01, "8"]) expect((await f.send("POST", `/rankings/${board.id}/contributions`, { version: 2, rows: [{ ...row(null, 0), score }] }, owner.cookie)).statusCode).toBe(400);
  });

  it("honors explicitly configured trusted proxy IPs only", async () => {
    const f = await fixture("127.0.0.1"), owner = await f.register("owner");
    expect((await f.send("POST", "/ranking-imports", {}, owner.cookie, { "x-forwarded-for": "1.1.1.1" })).statusCode).toBe(200);
    const second = await f.send("POST", "/ranking-imports", {}, owner.cookie, { "x-forwarded-for": "2.2.2.2" });
    expect(f.store.database.prepare("SELECT key FROM ranking_limits WHERE key LIKE 'import:%'").all()).toEqual([{ key: "import:1.1.1.1" }, { key: "import:2.2.2.2" }]);
    expect(second.statusCode).toBe(200);
  });

  it("throttles authentication attempts and expires sessions without blocking search", async () => {
    const f = await fixture(), owner = await f.register("owner");
    for (let count = 0; count < 9; count++) expect((await f.send("POST", "/auth/login", { email: "bad", password: "bad" })).statusCode).toBe(400);
    const limited = await f.send("POST", "/auth/login", { email: "owner@example.com", password: "safe-password-123" });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("60");
    expect((await f.send("GET", "/search?type=vn&q=test")).statusCode).toBe(200);
    f.advance(7 * 86400000);
    expect((await f.send("GET", "/auth/me", undefined, owner.cookie)).json().user).toBeNull();
  });

  it("rolls back all rows on a late invalid target and leaves import token reusable", async () => {
    const f = await fixture(), owner = await f.register("owner");
    const board = (await f.send("POST", "/rankings", { title: "原子导入", source: "empty" }, owner.cookie)).json();
    const importId = (await f.send("POST", "/ranking-imports", {}, owner.cookie)).json().importId;
    const path = `/rankings/${board.id}/contributions`;
    expect((await f.send("POST", path, { version: 1, importId, rows: [row("v1", 8), { ...row(null, 7), entryId: "missing" }] }, owner.cookie)).statusCode).toBe(400);
    expect((await f.send("GET", `/rankings/${board.id}`)).json()).toMatchObject({ version: 1, entries: [] });
    const valid = await f.send("POST", path, { version: 1, importId, rows: [row("v1", 8), row("v2", 7)] }, owner.cookie);
    expect(valid.statusCode).toBe(200);
    expect(valid.json().entries).toHaveLength(2);
  });

  it("persists accounts, board snapshots and reservations independently of cache pruning", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gtool-rankings-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, "rankings.sqlite");
    let store = new RankingStore(path);
    const user = await store.register("persistent@example.com", "safe-password-123", "持久化");
    const session = store.session(user), board = store.create("测试", user, []), reservation = store.reserve(user, "ip");
    store.close(); store = new RankingStore(path);
    const cache = new CacheStore(join(dir, "cache.sqlite")); cache.prune(); cache.close();
    expect(store.user(session)?.id).toBe(user.id);
    expect(store.get(board.id).title).toBe("测试");
    expect(() => store.checkImport(reservation.importId, user.id)).not.toThrow();
    expect(() => store.reserve(user, "ip")).toThrow();
    store.close();
  });
});
