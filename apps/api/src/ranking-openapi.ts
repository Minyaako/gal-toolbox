const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const text = { type: "string" };
const score = { type: ["number", "null"] };
const version = { type: "integer", minimum: 1 };
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required });
const array = (items: unknown) => ({ type: "array", items });
const userResponse = obj({ user: ref("RankingUser") });
const boardParameter = { name: "id", in: "path", required: true, schema: text };
function operation(summary: string, response: unknown, body?: unknown, parameters: unknown[] = [], authenticated = false) {
  return {
    tags: ["Rankings"], summary, parameters,
    description: "Responses are no-store. Mutations require JSON and same-origin requests. Versions prevent lost updates. Emails appear only in the caller's auth response.",
    ...(authenticated ? { security: [{ rankingSession: [] }] } : {}),
    ...(body ? { requestBody: { required: true, content: { "application/json": { schema: body } } } } : {}),
    responses: {
      "200": { description: "Success", content: { "application/json": { schema: response } } },
      ...Object.fromEntries([400, 401, 403, 404, 409, 415, 429, 502].map((status) => [status, { description: status === 409 ? "Version or account conflict" : status === 429 ? "Rate limit; Retry-After seconds" : "Request failed", ...(status === 429 ? { headers: { "Retry-After": { schema: { type: "integer" } } } } : {}), content: { "application/json": { schema: ref("Error") } } }])),
    },
  };
}
const credentials = { email: { type: "string", format: "email", maxLength: 254 }, password: { type: "string", minLength: 10, maxLength: 128 } };
export const rankingPaths = {
  "/auth/me": { get: operation("Current session", obj({ user: { anyOf: [ref("RankingUser"), { type: "null" }] } })) },
  "/auth/register": { post: operation("Register unverified email and password; 10 auth attempts/IP/minute", userResponse, obj({ ...credentials, displayName: { type: "string", minLength: 1, maxLength: 40 } })) },
  "/auth/login": { post: operation("Log in and rotate cookie session (7 days)", userResponse, obj(credentials)) },
  "/auth/logout": { post: operation("Invalidate session", obj({ ok: { const: true } }), obj({})) },
  "/rankings": {
    get: operation("Latest 50 public boards", obj({ items: array(ref("RankingBoardSummary")) })),
    post: operation("Create board; VNDB initializes top 50, at least 100 votes; 10 boards/user/hour", ref("RankingBoard"), obj({ title: { type: "string", minLength: 1, maxLength: 100 }, source: { enum: ["empty", "vndb"] } }), [], true),
  },
  "/rankings/vndb": { get: operation("Read-only VNDB top 50 snapshot (0–10 rating)", ref("RankingBoard")) },
  "/rankings/{id}": { get: operation("Complete board snapshot including contributions", ref("RankingBoard"), undefined, [boardParameter]) },
  "/ranking-imports": { post: operation("Reserve import: one/IP/60 seconds; bound to user, expires in 30 minutes", obj({ importId: text, expiresAt: { type: "integer", description: "Unix milliseconds" } }), obj({}), [], true) },
  "/rankings/{id}/contributions": { post: operation("Merge or replace own votes atomically; batches require single-use reservation", ref("RankingBoard"), obj({ version, rows: { ...array(ref("RankingRow")), minItems: 1, maxItems: 50 }, importId: text }, ["version", "rows"]), [boardParameter], true) },
  "/rankings/{id}/order": { put: operation("Owner: replay moves, target reference +0.1; explicit order wins", ref("RankingBoard"), obj({ version, moves: { ...array(obj({ entryId: text, position: { type: "integer", minimum: 1, maximum: 500 } })), minItems: 1, maxItems: 500 } }), [boardParameter], true) },
  "/rankings/{id}/reset-order": { post: operation("Owner: restore automatic score/VNDB/name ordering", ref("RankingBoard"), obj({ version }), [boardParameter], true) },
  "/rankings/{id}/entries/{entryId}": { delete: operation("Owner: remove an entry and its contributions", ref("RankingBoard"), obj({ version }), [boardParameter, { name: "entryId", in: "path", required: true, schema: text }], true) },
};
const boardProperties = { id: text, title: text, ownerId: { type: ["string", "null"] }, version: { type: "integer", minimum: 0 }, mode: { enum: ["auto", "manual"] } };
export const rankingSchemas = {
  RankingUser: obj({ id: text, email: { type: "string", format: "email" }, displayName: text, emailVerified: { const: false } }),
  RankingContribution: obj({ userId: text, displayName: text, score: { type: "number", minimum: 0, maximum: 10 }, extra: text }),
  RankingEntry: obj({ id: text, vnId: { type: ["string", "null"] }, name: text, image: ref("EntityImage"), vndbRating: score, seedScore: score, averageScore: score, scoreCount: { type: "integer" }, sortScore: { ...score, description: "Reference only; may exceed 10; never included in user average" }, contributions: array(ref("RankingContribution")) }),
  RankingBoard: obj({ ...boardProperties, entries: { ...array(ref("RankingEntry")), maxItems: 500 } }),
  RankingBoardSummary: obj({ ...boardProperties, entryCount: { type: "integer" } }),
  RankingRow: obj({ vnId: { type: ["string", "null"], pattern: "^v[1-9]\\d*$" }, name: { type: "string", minLength: 1, maxLength: 300 }, score: { type: "number", minimum: 0, maximum: 10 }, extra: { type: "string", maxLength: 4000 }, entryId: { type: "string", description: "Explicit existing entry; cannot retarget its VNDB identity" } }, ["vnId", "name", "score", "extra"]),
};
