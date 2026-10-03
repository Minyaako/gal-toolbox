# Shared rankings — implementation contract

Status: implemented and locally verified, 2026-10-02; publication authorized, not merged or deployed. R3: authentication, persistent user data and public API.

## Confirmed scope

- Public read-only VNDB board and user-created shared boards. “Private/personal” means user-owned, not access-restricted: reading is public and any logged-in user can contribute.
- Initialize from VNDB top 50 (bounded first version), Excel, or an empty board with manual search. VNDB is an initialization source, not a replacement for missing user votes.
- Email/password accounts, no email verification or password-recovery emails in v1. Display names are public; emails never appear in boards. Session cookies HttpOnly, SameSite=Strict, Secure in production; salted asynchronous scrypt; JSON-only mutation requests and origin checks. Login/register throttled independently from search.
- Excel .xlsx, max 5 MiB / 50 nonempty rows per import. Sheet and three distinct columns selectable; user confirms 0–10 scale; reject invalid scores, never silently rescale. Legacy .xls must be saved as .xlsx. Lazy-load ExcelJS, do not execute formulas.
- Match names through existing VN search sequentially, Chinese-first. Only unique exact name/alias matches auto-select; ambiguous/missing/error rows remain visible for retry, explicit candidate selection or submission without VNDB ID. Preserve rows while matching; cancel on close/navigation.
- Merge matched entries by VNDB ID. Unmatched entries receive unique IDs, never fuzzy-merge. Each user has one score/extra per entry; resubmission replaces their contribution. Duplicate matched rows in a batch are rejected for explicit correction (no silent loss).
- Submitted names are 1–300 characters, extra comments 0–4000; client and server enforce identical limits.
- Operational safeguards: login/registration share 10 attempts per IP/minute; board creation max10 per account/hour. Trusted proxies use explicit TRUST_PROXY_CIDRS (production network verified172.18.0.0/16), never a hop-only count.
- Average user scores; ties use VNDB score descending then Chinese name (stable ID last). VNDB seed entries retain a distinct seedScore until contributed to. Unscored entries last. VNDB scores in board DTO are 0–10 (existing VN detail remains 10–100).
- Owner-only drag / numeric-position editing, local preview and one server submission. Persist relative order plus reference scores: moving a row assigns target's previous reference/effective score +0.1. Reference scores are not user ratings and may exceed 10. Actual order wins over reference score. Contributions preserve manual order, new entries append; owner can reset automatic order or remove entries.
- Details reuse existing VN page with board context and contributions; unmatched entries show their own title/contributions without a fake VN URL.
- One board GET includes names/images/scores/reviews: no per-row VNDB requests on board open. Hydrate new IDs server-side in one bounded /vn query. Public VNDB response cached; local board snapshots persistent.
- Batch hydration uses `['or', ['id','=','v17'], ['id','=','v2002'], ...]` (a single ID uses a single predicate). VNDB rejects `['id','=',idsArray]`; this was verified against the real upstream, not only mocks.
- Import reservations are server-side, per trusted client IP, at most one per 60 seconds; token expires in 30 minutes, is bound to user, single-use, consumed only with successful submission. Search has no product quota but uses existing upstream scheduler. Manual submission accepts one row; batches require token. Use socket IP unless explicitly configured trusted proxy; never trust arbitrary X-Forwarded-For.

## Frozen v1 API (all paths below /api/v1)

All mutation errors use `{error:{code,message}}`. 401 login required, 403 forbidden, 409 version conflict, 429 Retry-After. Mutations accept application/json; all auth/board responses no-store. User and board IDs are opaque strings. Version checks and writes atomic, no partial import.

```ts
type User = { id: string; email: string; displayName: string; emailVerified: false };
type Contribution = { userId: string; displayName: string; score: number; extra: string };
type Entry = {
  id: string; vnId: string | null; name: string; image: EntityImage;
  vndbRating: number | null; seedScore: number | null;
  averageScore: number | null; scoreCount: number;
  sortScore: number | null; contributions: Contribution[];
};
type Board = { id: string; title: string; ownerId: string | null; version: number;
  mode: 'auto' | 'manual'; entries: Entry[] };
type Row = { vnId: string | null; name: string; score: number; extra: string; entryId?: string };
```

- GET /auth/me → `{user: User|null}`.
- POST /auth/register `{email,password,displayName}` and /auth/login `{email,password}` → `{user:User}`, session cookie. Password 10–128 chars, displayName 1–40, email max254.
- POST /auth/logout `{}` → `{ok:true}` clears session.
- GET /rankings → `{items: {id,title,ownerId,version,mode,entryCount}[]}` latest 50.
- GET /rankings/vndb → Board with id `vndb`, ownerId null, version0; top50 by rating, minimum100 votes, no user contributions.
- GET /rankings/:id → Board, complete snapshot, max500 entries per custom board.
- POST /rankings `{title,source:'empty'|'vndb'}` → Board; authenticated. Excel starts empty then imports.
- POST /ranking-imports `{}` → `{importId:string,expiresAt:number}`; authenticated, per-IP60s.
- POST /rankings/:id/contributions `{version,rows:Row[],importId?:string}` → Board. Single manual row or <=50 import rows. Existing unmatched entry can be explicitly targeted via entryId; cannot retarget an existing VN entry or change another contributor's metadata.
- PUT /rankings/:id/order `{version,moves:{entryId:string,position:number}[]}` → Board. Owner only, positions1-based, moves replayed in order server-side to calculate +0.1 correctly. Empty moves invalid. Max500.
- POST /rankings/:id/reset-order `{version}` → Board, owner only.
- DELETE /rankings/:id/entries/:entryId `{version}` → Board, owner only.

## Ownership and sequence

1. API worker: apps/api only — separate RankingStore database, auth, endpoints, snapshot hydration, behavioral/security tests, app/server wiring. Optional buildApp rankingStore for tests defaults to in-memory; server uses RANKING_DB_PATH.
2. Web worker: apps/web src only — ranking API client/types, account form, board navigation via /ranking?board=id, create/import/search/edit/submit, detail context via ?board=id, styles and tests. Main handles dependency installation and package lock.
3. Main: dependency pin, compose persistent volume config, API/deployment documentation; integrate, full tests/build/browser QA. Independent reviewer after implementation; fix findings before declaring complete.

## Acceptance and recovery

Verify two users merge ratings and preserve extras, same-user replacement, owner permissions, non-owner mutation rejection, stale-version conflict, cookie/logout and CSRF boundaries, input validation, import per-IP60s/token replay, sorting/move/reset, SQLite reopen persistence and cache-prune isolation. Test Excel column mapping/invalid rows/formulas and match failures, plus desktop/mobile user flows.

RANKING_DB_PATH defaults to data/rankings.sqlite (production /data/rankings.sqlite). No migration of cache data; additive tables only. Persistent volume now contains irreplaceable accounts/boards: never delete it to clear cache. Back up SQLite using online backup or stop service and copy database plus WAL before deployment; retain backup off-volume. Rollback application to prior release keeps rankings database intact; do not drop new tables or delete volume. No production deployment in this implementation step without separate release verification.

## Evidence / remaining work

- Base: codex/shared-rankings starts from 87479c1, preserves frontend fix PR #8.
- Official references checked: https://api.vndb.org/kana ; https://nodejs.org/api/crypto.html ; https://github.com/exceljs/exceljs .
- Tag2/API48/Web101 tests, root typecheck, production build, independent implementation/security review passed. All reported review findings resolved. Compose config parses; dependency audit reports0 vulnerabilities after compatible updates (ExcelJS uuid override11.1.1 retains required CommonJS v4 API).
- Real upstream verified top50 query, Chinese titles and batch-ID OR syntax. Browser smoke verified signup, VNDB clone, score/extra, numeric move save/reload, native drag/cancel, real xlsx mapping/failed-match explicit submit, original VN detail reviews. Two users produce8.75 from8.25+9.25 and preserve both extras; nonowner reset403 and repeated IP reservation429 withRetry-After60.
- Manual search/add smoke then replaced the first user's v17 score with8.5: average8.875, scoreCount2, board still52 entries and manual mode; second user's9.25/extra unchanged.
- Visual checks:1440px/390px, no horizontal overflow, compact title and existing tokens retained. Screenshots `output/playwright/rankings-desktop.png`, `rankings-mobile.png`. Recreate the non-sensitive xlsx fixture with `node scripts/create-ranking-fixture.mjs`.
- No production mutations were performed. First sandboxed local upstream attempts failed502; authorized-network local run succeeded. Release requires explicit publication/deployment workflow and persistent backup.
- Limits: all user-owned boards public-read/shared-contribute (not privacy ACLs); top50 seed,50 rows/import,500 entries/board, directory latest50; no email verification/recovery/history. Full snapshot includes contributions, so large contributor counts will eventually require pagination. ZIP directory preflight rejects declared expansion>20MiB/encrypted/ZIP64/truncated files; malformed content may still be rejected by ExcelJS. Excel chunk is large (~937kB minified) but lazy-loaded, not in ordinary first load.
