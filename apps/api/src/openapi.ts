const entityName = {
  type: "object",
  required: ["primary", "original", "romanized", "alternatives"],
  properties: {
    primary: { type: "string" },
    original: { type: ["string", "null"] },
    romanized: { type: ["string", "null"] },
    alternatives: { type: "array", items: { type: "string" } },
  },
} as const;

const entityImage = {
  anyOf: [
    {
      type: "object",
      required: ["url", "thumbnailUrl", "sexual", "violence"],
      properties: {
        url: { type: "string", format: "uri" },
        thumbnailUrl: { type: ["string", "null"], format: "uri" },
        sexual: { type: "number", minimum: 0, maximum: 2 },
        violence: { type: "number", minimum: 0, maximum: 2 },
      },
    },
    { type: "null" },
  ],
} as const;

const entitySummary = {
  type: "object",
  required: ["id", "type", "name", "image"],
  properties: {
    id: { type: "string", pattern: "^(v|c|s|g)\\d+$" },
    type: { type: "string", enum: ["vn", "character", "staff", "tag"] },
    name: { $ref: "#/components/schemas/EntityName" },
    image: { $ref: "#/components/schemas/EntityImage" },
  },
} as const;

const errorResponse = {
  description: "Request failed",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
} as const;

const cacheHeader = {
  "X-Cache": {
    description: "Persistent upstream cache status",
    schema: { type: "string", enum: ["HIT", "MISS", "STALE", "LOCAL"] },
  },
} as const;

const schedulingHeaders = {
  ...cacheHeader,
  "Server-Timing": {
    description: "Queue wait and VNDB upstream durations in milliseconds",
    schema: { type: "string" },
  },
  "X-Request-Priority": {
    description: "Final scheduler priority after promotion and aging",
    schema: { type: "string", enum: ["high", "normal", "low"] },
  },
} as const;

const priorityParameter = {
  name: "X-Request-Priority",
  in: "header",
  required: false,
  description: "Requested scheduler priority; invalid values use normal",
  schema: { type: "string", enum: ["high", "normal", "low"], default: "normal" },
} as const;

const idParameter = (name: string, pattern: string) => ({
  name: "id",
  in: "path",
  required: true,
  description: `${name} VNDB identifier`,
  schema: { type: "string", pattern },
});

const pageParameters = [
  {
    name: "page",
    in: "query",
    schema: { type: "integer", minimum: 1, default: 1 },
  },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 50, default: 12 },
  },
] as const;

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Gal Toolbox API",
    version: "1.2.0",
    description:
      "Stable API boundary for VNDB-powered visual association search. Frontends should depend on these DTOs instead of VNDB response shapes.",
  },
  servers: [{ url: "/api/v1", description: "Current origin" }],
  tags: [
    { name: "System" },
    { name: "Search" },
    { name: "Visual novels" },
    { name: "Characters" },
    { name: "Staff" },
    { name: "Tags" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Service health",
        responses: {
          "200": {
            description: "Healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status", "cache", "apiVersion"],
                  properties: {
                    status: { const: "ok" },
                    cache: { const: "sqlite" },
                    apiVersion: { const: 1 },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/search": {
      get: {
        tags: ["Search"],
        summary: "Search VNDB entities",
        description:
          "Tag searches also accept Simplified Chinese names from the bundled localization index.",
        parameters: [
          priorityParameter,
          {
            name: "type",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["vn", "character", "staff", "tag"] },
          },
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 120 },
          },
          ...pageParameters,
        ],
        responses: {
          "200": {
            description: "Entity page",
            headers: schedulingHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/EntityPage" } } },
          },
          "400": errorResponse,
          "429": errorResponse,
          "502": errorResponse,
        },
      },
    },
    "/vns/{id}": {
      get: {
        tags: ["Visual novels"],
        summary: "Visual novel details, cast, relations and tags",
        parameters: [priorityParameter, idParameter("Visual novel", "^v\\d+$")],
        responses: {
          "200": {
            description: "Visual novel detail",
            headers: schedulingHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/VnDetail" } } },
          },
          "404": errorResponse,
        },
      },
    },
    "/characters/{id}": {
      get: {
        tags: ["Characters"],
        summary: "Character details and VN appearances",
        parameters: [priorityParameter, idParameter("Character", "^c\\d+$")],
        responses: {
          "200": {
            description: "Character detail",
            headers: schedulingHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CharacterDetail" } } },
          },
          "404": errorResponse,
        },
      },
    },
    "/staff/{id}": {
      get: {
        tags: ["Staff"],
        summary: "Staff details and aliases",
        parameters: [priorityParameter, idParameter("Staff", "^s\\d+$")],
        responses: {
          "200": {
            description: "Staff detail",
            headers: schedulingHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/StaffDetail" } } },
          },
          "404": errorResponse,
        },
      },
    },
    "/staff/{id}/characters": {
      get: {
        tags: ["Staff"],
        summary: "Characters voiced by a staff member",
        parameters: [priorityParameter, idParameter("Staff", "^s\\d+$"), ...pageParameters],
        responses: {
          "200": {
            description: "Staff character page",
            headers: schedulingHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/StaffCharacterPage" } } },
          },
        },
      },
    },
    "/tags/{id}": {
      get: {
        tags: ["Tags"],
        summary: "Tag details",
        parameters: [priorityParameter, idParameter("Tag", "^g\\d+$")],
        responses: {
          "200": {
            description: "Tag detail",
            headers: schedulingHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/TagDetail" } } },
          },
          "404": errorResponse,
        },
      },
    },
    "/tags/{id}/vns": {
      get: {
        tags: ["Tags"],
        summary: "Highest-rated visual novels carrying a tag",
        parameters: [priorityParameter, idParameter("Tag", "^g\\d+$"), ...pageParameters],
        responses: {
          "200": {
            description: "Visual novel page",
            headers: schedulingHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/EntityPage" } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      EntityName: entityName,
      EntityImage: entityImage,
      EntitySummary: entitySummary,
      EntityPage: {
        type: "object",
        required: ["items", "page", "pageSize", "more"],
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/EntitySummary" } },
          page: { type: "integer" },
          pageSize: { type: "integer" },
          more: { type: "boolean" },
        },
      },
      VnDetail: {
        type: "object",
        required: ["entity", "description", "released", "rating", "voteCount", "relations", "cast", "tags"],
        properties: {
          entity: { $ref: "#/components/schemas/EntitySummary" },
          description: { type: ["string", "null"] },
          released: { type: ["string", "null"] },
          rating: { type: ["number", "null"] },
          voteCount: { type: "integer" },
          relations: { type: "array", items: { type: "object" } },
          cast: { type: "array", items: { type: "object" } },
          tags: { type: "array", items: { type: "object" } },
        },
      },
      CharacterDetail: {
        type: "object",
        required: ["entity", "description", "appearances"],
        properties: {
          entity: { $ref: "#/components/schemas/EntitySummary" },
          description: { type: ["string", "null"] },
          appearances: { type: "array", items: { type: "object" } },
        },
      },
      StaffDetail: {
        type: "object",
        required: ["entity", "description", "language", "aliases", "externalLinks"],
        properties: {
          entity: { $ref: "#/components/schemas/EntitySummary" },
          description: { type: ["string", "null"] },
          language: { type: ["string", "null"] },
          aliases: { type: "array", items: { type: "object" } },
          externalLinks: { type: "array", items: { type: "object" } },
        },
      },
      StaffCharacterPage: {
        allOf: [{ $ref: "#/components/schemas/EntityPage" }],
      },
      TagDetail: {
        type: "object",
        required: ["entity", "description", "category", "vnCount"],
        properties: {
          entity: { $ref: "#/components/schemas/EntitySummary" },
          description: { type: ["string", "null"] },
          category: { type: ["string", "null"], enum: ["cont", "ero", "tech", null] },
          vnCount: { type: "integer" },
        },
      },
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message", "requestId"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              requestId: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

export function openApiDocsHtml(): string {
  const rows = Object.entries(openApiDocument.paths)
    .map(([path, item]) => {
      const operation = "get" in item ? item.get : null;
      return `<li><code>GET /api/v1${path}</code><span>${operation?.summary ?? ""}</span></li>`;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Gal Toolbox API v1</title><link rel="icon" href="data:,"><style>
body{margin:0;background:#f4efe4;color:#172a36;font:16px/1.6 system-ui,sans-serif}main{max-width:920px;margin:auto;padding:64px 24px}
h1{font:700 clamp(2.5rem,8vw,5rem)/1.05 Georgia,serif;margin:.2em 0}p{max-width:65ch;color:#5e6869}
a{color:#b43d2b}ul{list-style:none;padding:0;border-top:1px solid #b9ad9c}li{display:grid;grid-template-columns:minmax(260px,1fr) 1fr;gap:24px;padding:16px 0;border-bottom:1px solid #b9ad9c}code{font-weight:700}
@media(max-width:620px){li{grid-template-columns:1fr;gap:2px}}</style></head>
<body><main><small>OPENAPI 3.1 / VERSION ${openApiDocument.info.version}</small><h1>Gal Toolbox API</h1>
<p>前端稳定接口边界。机器可读文档：<a href="/api/v1/openapi.json">openapi.json</a></p><ul>${rows}</ul></main></body></html>`;
}
