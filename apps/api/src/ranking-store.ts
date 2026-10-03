import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { EntityImage } from "./types.js";

export class RankingError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryAfter?: number) { super(message); }
}
export function invalid(message = "请求参数不正确。 "): never { throw new RankingError(400, "BAD_REQUEST", message); }
export type RankingUser = { id: string; email: string; displayName: string; emailVerified: false };
export type RankingEntry = { id: string; vnId: string | null; name: string; image: EntityImage; vndbRating: number | null; seedScore: number | null; averageScore: number | null; scoreCount: number; sortScore: number | null; contributions: { userId: string; displayName: string; score: number; extra: string }[] };
export type RankingBoard = { id: string; title: string; ownerId: string | null; version: number; mode: "auto" | "manual"; entries: RankingEntry[] };
export type RankingRow = { vnId: string | null; name: string; score: number; extra: string; entryId?: string };
export const effectiveScore = (e: RankingEntry) => e.averageScore ?? e.seedScore;
export function automaticOrder(board: RankingBoard): void {
  board.entries.sort((a, b) => (effectiveScore(b) ?? -1) - (effectiveScore(a) ?? -1) || (b.vndbRating ?? -1) - (a.vndbRating ?? -1) || a.name.localeCompare(b.name, "zh-CN") || a.id.localeCompare(b.id));
}
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
let activeHashes = 0;
async function passwordHash(password: string, salt: string): Promise<Buffer> {
  if (activeHashes >= 4) throw new RankingError(429, "AUTH_BUSY", "登录繁忙，请稍后重试。", 2);
  activeHashes++;
  try { return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key))); }
  finally { activeHashes--; }
}

/** Persistent user data is intentionally separate from the disposable HTTP cache. */
export class RankingStore {
  readonly database: DatabaseSync;
  constructor(path = ":memory:", private readonly now: () => number = Date.now) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS ranking_users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ranking_sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ranking_boards(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ranking_imports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ranking_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
  }
  close() { this.database.close(); }
  private transaction<T>(work: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try { const value = work(); this.database.exec("COMMIT"); return value; }
    catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
  limit(key: string, maximum: number, window: number): void {
    this.transaction(() => {
      this.database.prepare("DELETE FROM ranking_limits WHERE expires<=?").run(this.now());
      const row = this.database.prepare("SELECT count,expires FROM ranking_limits WHERE key=?").get(key) as { count: number; expires: number } | undefined;
      if (row && row.count >= maximum) throw new RankingError(429, "RATE_LIMITED", "操作过于频繁，请稍后重试。", Math.max(1, Math.ceil((row.expires - this.now()) / 1000)));
      this.database.prepare("INSERT INTO ranking_limits VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=count+1").run(key, 1, this.now() + window);
    });
  }
  async register(email: string, password: string, displayName: string): Promise<RankingUser> {
    const salt = randomBytes(24).toString("hex");
    const hash = (await passwordHash(password, salt)).toString("hex");
    const user: RankingUser = { id: randomUUID(), email, displayName, emailVerified: false };
    try { this.database.prepare("INSERT INTO ranking_users VALUES(?,?,?,?,?)").run(user.id, email, displayName, salt, hash); }
    catch (error) { if (this.database.prepare("SELECT id FROM ranking_users WHERE email=?").get(email)) throw new RankingError(409, "ACCOUNT_EXISTS", "该邮箱已注册，请登录。 "); throw error; }
    return user;
  }
  async login(email: string, password: string): Promise<RankingUser> {
    const row = this.database.prepare("SELECT * FROM ranking_users WHERE email=?").get(email) as { id: string; email: string; name: string; salt: string; hash: string } | undefined;
    const hash = await passwordHash(password, row?.salt ?? "missing-user-constant-salt");
    if (!row || !timingSafeEqual(hash, Buffer.from(row.hash, "hex"))) throw new RankingError(401, "INVALID_CREDENTIALS", "邮箱或密码不正确。 ");
    return { id: row.id, email: row.email, displayName: row.name, emailVerified: false };
  }
  session(user: RankingUser): string {
    this.database.prepare("DELETE FROM ranking_sessions WHERE expires<=?").run(this.now());
    const token = randomBytes(32).toString("hex");
    this.database.prepare("INSERT INTO ranking_sessions VALUES(?,?,?)").run(hashToken(token), user.id, this.now() + 7 * 86400000);
    return token;
  }
  logout(token: string) { this.database.prepare("DELETE FROM ranking_sessions WHERE token=?").run(hashToken(token)); }
  user(token: string): RankingUser | null {
    const row = this.database.prepare("SELECT u.id,u.email,u.name FROM ranking_users u JOIN ranking_sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?").get(hashToken(token), this.now()) as { id: string; email: string; name: string } | undefined;
    return row ? { id: row.id, email: row.email, displayName: row.name, emailVerified: false } : null;
  }
  reserve(user: RankingUser, ip: string) {
    this.limit(`import:${ip}`, 1, 60000);
    this.database.prepare("DELETE FROM ranking_imports WHERE expires<=?").run(this.now());
    const reservation = { importId: randomUUID(), expiresAt: this.now() + 30 * 60000 };
    this.database.prepare("INSERT INTO ranking_imports VALUES(?,?,?)").run(reservation.importId, user.id, reservation.expiresAt);
    return reservation;
  }
  checkImport(id: string, userId: string): void {
    if (!this.database.prepare("SELECT id FROM ranking_imports WHERE id=? AND user_id=? AND expires>?").get(id, userId, this.now())) throw new RankingError(400, "INVALID_IMPORT", "导入凭证无效、已使用或已过期。 ");
  }
  get(id: string): RankingBoard {
    const row = this.database.prepare("SELECT payload FROM ranking_boards WHERE id=?").get(id) as { payload: string } | undefined;
    if (!row) throw new RankingError(404, "NOT_FOUND", "榜单不存在。 ");
    return JSON.parse(row.payload) as RankingBoard;
  }
  list() {
    return (this.database.prepare("SELECT payload FROM ranking_boards ORDER BY updated DESC,id LIMIT 50").all() as { payload: string }[]).map(({ payload }) => {
      const { entries, ...board } = JSON.parse(payload) as RankingBoard;
      return { ...board, entryCount: entries.length };
    });
  }
  create(title: string, user: RankingUser, entries: RankingEntry[]): RankingBoard {
    const board: RankingBoard = { id: randomUUID(), title, ownerId: user.id, version: 1, mode: "auto", entries: structuredClone(entries) };
    automaticOrder(board);
    this.database.prepare("INSERT INTO ranking_boards VALUES(?,?,?)").run(board.id, JSON.stringify(board), this.now());
    return board;
  }
  mutate(id: string, version: number, user: RankingUser, ownerOnly: boolean, work: (board: RankingBoard) => void, importId?: string): RankingBoard {
    return this.transaction(() => {
      const board = this.get(id);
      if (ownerOnly && board.ownerId !== user.id) throw new RankingError(403, "FORBIDDEN", "仅榜单创建者可以执行此操作。 ");
      if (board.version !== version) throw new RankingError(409, "VERSION_CONFLICT", "榜单已更新，请刷新后重新提交。 ");
      if (importId) this.checkImport(importId, user.id);
      work(board);
      if (board.entries.length > 500) invalid("每张榜单最多包含 500 个作品。 ");
      board.version++;
      this.database.prepare("UPDATE ranking_boards SET payload=?,updated=? WHERE id=?").run(JSON.stringify(board), this.now(), id);
      if (importId) this.database.prepare("DELETE FROM ranking_imports WHERE id=?").run(importId);
      return board;
    });
  }
}
