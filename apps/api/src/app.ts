import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
} from "fastify";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CacheStore } from "./cache.js";
import { openApiDocsHtml, openApiDocument } from "./openapi.js";
import type { EntitySummary, EntityType } from "./types.js";
import {
  cleanVndbText,
  fields,
  mapCharacterSummary,
  mapStaffSummary,
  mapTagSummary,
  mapVnSummary,
  type RawCharacter,
  type RawStaff,
  type RawTag,
  type RawVn,
  VndbClient,
  VndbError,
} from "./vndb.js";

const SEARCH_TTL = 15 * 60 * 1000;
const ENTITY_TTL = 24 * 60 * 60 * 1000;
const RELATION_TTL = 12 * 60 * 60 * 1000;

type AppOptions = {
  cache: CacheStore;
  client?: VndbClient;
  logger?: boolean;
};

type RawVnDetail = RawVn & {
  description?: string | null;
  released?: string | null;
  rating?: number | null;
  votecount?: number;
  relations?: Array<RawVn & { relation?: string }>;
  va?: Array<{
    note?: string | null;
    character: RawCharacter;
    staff: RawStaff;
  }>;
  tags?: Array<RawTag & { rating: number; spoiler: number }>;
};

type RawCharacterDetail = RawCharacter & {
  description?: string | null;
  vns?: Array<RawVn & { role: "main" | "primary" | "side" | "appears" }>;
};

type RawStaffDetail = RawStaff & {
  description?: string | null;
  lang?: string;
  extlinks?: Array<{ url: string; label: string }>;
};

type RawTagDetail = RawTag & {
  description?: string | null;
};

function setCacheHeader(reply: FastifyReply, status: string): void {
  reply.header("X-Cache", status);
}

function parsePage(query: Record<string, unknown>): {
  page: number;
  pageSize: number;
} {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 12);
  if (!Number.isInteger(page) || page < 1) throw new Error("Invalid page");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new Error("Invalid pageSize");
  }
  return { page, pageSize };
}

function validateId(value: string, prefix: "v" | "c" | "s" | "g"): void {
  if (!new RegExp(`^${prefix}\\d+$`).test(value)) throw new Error("Invalid id");
}

function dedupe(items: EntitySummary[]): EntitySummary[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const client = options.client ?? new VndbClient(options.cache);

  await app.register(cors, {
    origin: process.env.NODE_ENV === "production" ? false : true,
  });

  app.get("/api/v1/openapi.json", async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=3600");
    return openApiDocument;
  });

  app.get("/api/docs", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(openApiDocsHtml());
  });

  app.get("/api/v1/health", async () => ({
    status: "ok",
    cache: "sqlite",
    apiVersion: 1,
  }));

  app.get("/api/v1/search", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const type = query.type as EntityType;
    const term = String(query.q ?? "").trim();
    if (!["vn", "character", "staff", "tag"].includes(type)) {
      throw new Error("Invalid entity type");
    }
    if (term.length < 1 || term.length > 120) throw new Error("Invalid query");
    const { page, pageSize } = parsePage(query);

    const endpoint = type === "vn" ? "/vn" : type === "tag" ? "/tag" : `/${type}`;
    const selectedFields =
      type === "vn"
        ? fields.vnSummary
        : type === "character"
          ? fields.characterSummary
          : type === "staff"
            ? fields.staffSummary
            : fields.tagSummary;
    const result = await client.query<RawVn | RawCharacter | RawStaff | RawTag>(
      endpoint,
      {
        filters: ["search", "=", term],
        fields: selectedFields,
        sort: "searchrank",
        results: pageSize,
        page,
      },
      SEARCH_TTL,
    );
    setCacheHeader(reply, result.cacheStatus);

    const mapped = result.data.results.map((item) =>
      type === "vn"
        ? mapVnSummary(item as RawVn)
        : type === "character"
          ? mapCharacterSummary(item as RawCharacter)
          : type === "staff"
            ? mapStaffSummary(item as RawStaff)
            : mapTagSummary(item as RawTag),
    );
    return {
      items: type === "staff" ? dedupe(mapped) : mapped,
      page,
      pageSize,
      more: result.data.more,
    };
  });

  app.get<{ Params: { id: string } }>("/api/v1/vns/:id", async (request, reply) => {
    validateId(request.params.id, "v");
    const result = await client.query<RawVnDetail>(
      "/vn",
      {
        filters: ["id", "=", request.params.id],
        fields: [
          fields.vnSummary,
          "description,released,rating,votecount",
          `relations{relation,${fields.vnSummary}}`,
          `va{note,staff{${fields.staffSummary}},character{${fields.characterSummary}}}`,
          "tags{rating,spoiler,name,category}",
        ].join(","),
        results: 1,
      },
      RELATION_TTL,
    );
    setCacheHeader(reply, result.cacheStatus);
    const vn = result.data.results[0];
    if (!vn) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "未找到该作品。", requestId: request.id } });
    return {
      entity: mapVnSummary(vn),
      description: cleanVndbText(vn.description),
      released: vn.released ?? null,
      rating: vn.rating ?? null,
      voteCount: vn.votecount ?? 0,
      relations: (vn.relations ?? []).map((item) => ({
        entity: mapVnSummary(item),
        relation: item.relation ?? "related",
      })),
      cast: (vn.va ?? []).map((item) => ({
        character: mapCharacterSummary(item.character),
        staff: mapStaffSummary(item.staff),
        note: item.note ?? null,
      })),
      tags: (vn.tags ?? [])
        .map((tag) => ({
          tag: mapTagSummary(tag),
          rating: tag.rating,
          spoiler: tag.spoiler,
          category: tag.category ?? null,
        }))
        .sort((left, right) => right.rating - left.rating),
    };
  });

  app.get<{ Params: { id: string } }>("/api/v1/characters/:id", async (request, reply) => {
    validateId(request.params.id, "c");
    const result = await client.query<RawCharacterDetail>(
      "/character",
      {
        filters: ["id", "=", request.params.id],
        fields: `${fields.characterSummary},description,vns{role,${fields.vnSummary}}`,
        results: 1,
      },
      ENTITY_TTL,
    );
    setCacheHeader(reply, result.cacheStatus);
    const character = result.data.results[0];
    if (!character) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "未找到该角色。", requestId: request.id } });
    return {
      entity: mapCharacterSummary(character),
      description: cleanVndbText(character.description),
      appearances: (character.vns ?? []).map((vn) => ({
        vn: mapVnSummary(vn),
        role: vn.role,
      })),
    };
  });

  app.get<{ Params: { id: string } }>("/api/v1/staff/:id", async (request, reply) => {
    validateId(request.params.id, "s");
    const result = await client.query<RawStaffDetail>(
      "/staff",
      {
        filters: ["and", ["id", "=", request.params.id], ["ismain", "=", 1]],
        fields: `${fields.staffSummary},description,lang,extlinks{url,label}`,
        results: 1,
      },
      ENTITY_TTL,
    );
    setCacheHeader(reply, result.cacheStatus);
    const staff = result.data.results[0];
    if (!staff) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "未找到该声优或制作人员。", requestId: request.id } });
    return {
      entity: mapStaffSummary(staff),
      description: cleanVndbText(staff.description),
      language: staff.lang ?? null,
      aliases: staff.aliases ?? [],
      externalLinks: staff.extlinks ?? [],
    };
  });

  app.get<{ Params: { id: string } }>("/api/v1/staff/:id/characters", async (request, reply) => {
    validateId(request.params.id, "s");
    const { page, pageSize } = parsePage(request.query as Record<string, unknown>);
    const result = await client.query<RawCharacterDetail>(
      "/character",
      {
        filters: ["seiyuu", "=", ["id", "=", request.params.id]],
        fields: `${fields.characterSummary},vns{role,${fields.vnSummary}}`,
        sort: "name",
        results: pageSize,
        page,
      },
      RELATION_TTL,
    );
    setCacheHeader(reply, result.cacheStatus);
    return {
      items: result.data.results.map((character) => ({
        character: mapCharacterSummary(character),
        appearances: (character.vns ?? []).map((vn) => ({
          vn: mapVnSummary(vn),
          role: vn.role,
        })),
      })),
      page,
      pageSize,
      more: result.data.more,
    };
  });

  app.get<{ Params: { id: string } }>("/api/v1/tags/:id", async (request, reply) => {
    validateId(request.params.id, "g");
    const result = await client.query<RawTagDetail>(
      "/tag",
      {
        filters: ["id", "=", request.params.id],
        fields: `${fields.tagSummary},description`,
        results: 1,
      },
      ENTITY_TTL,
    );
    setCacheHeader(reply, result.cacheStatus);
    const tag = result.data.results[0];
    if (!tag) {
      return reply.code(404).send({
        error: { code: "NOT_FOUND", message: "未找到该 Tag。", requestId: request.id },
      });
    }
    return {
      entity: mapTagSummary(tag),
      description: cleanVndbText(tag.description),
      category: tag.category ?? null,
      vnCount: tag.vn_count ?? 0,
    };
  });

  app.get<{ Params: { id: string } }>("/api/v1/tags/:id/vns", async (request, reply) => {
    validateId(request.params.id, "g");
    const { page, pageSize } = parsePage(request.query as Record<string, unknown>);
    const result = await client.query<RawVn>(
      "/vn",
      {
        filters: ["tag", "=", request.params.id],
        fields: fields.vnSummary,
        sort: "rating",
        reverse: true,
        results: pageSize,
        page,
      },
      RELATION_TTL,
    );
    setCacheHeader(reply, result.cacheStatus);
    return {
      items: result.data.results.map(mapVnSummary),
      page,
      pageSize,
      more: result.data.more,
    };
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof VndbError) {
      const rateLimited = error.status === 429;
      return reply.code(rateLimited ? 429 : 502).send({
        error: {
          code: rateLimited ? "UPSTREAM_RATE_LIMITED" : "UPSTREAM_UNAVAILABLE",
          message: rateLimited
            ? "VNDB 请求过于频繁，请稍后重试。"
            : "暂时无法连接 VNDB，请稍后重试。",
          requestId: request.id,
        },
      });
    }

    if (error instanceof Error && error.message.startsWith("Invalid")) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "请求参数不正确。", requestId: request.id },
      });
    }

    request.log.error(error);
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "服务发生内部错误。", requestId: request.id },
    });
  });

  const webDist = resolve(process.cwd(), "../web/dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api/")) {
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "接口不存在。", requestId: request.id } });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
