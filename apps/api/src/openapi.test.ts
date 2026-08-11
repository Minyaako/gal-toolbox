import { describe, expect, it } from "vitest";
import { openApiDocsHtml, openApiDocument } from "./openapi.js";

describe("OpenAPI document", () => {
  it("publishes the current version and exploration paths", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(openApiDocument.info.version).toBe("1.3.0");
    expect(openApiDocument.tags).toContainEqual({ name: "Artists" });
    expect(openApiDocument.paths).toHaveProperty("/tags/{id}");
    expect(openApiDocument.paths).toHaveProperty("/tags/{id}/vns");
    expect(openApiDocument.paths).toHaveProperty("/artists/{id}");
    expect(openApiDocument.paths).toHaveProperty("/artists/{id}/vns");
    expect(openApiDocument.paths["/search"].get.description).toContain("Chinese");
  });

  it("publishes artist DTO schemas and cache semantics", () => {
    expect(openApiDocument.components.schemas.VnDetail.required).toContain("artists");
    expect(openApiDocument.components.schemas.ArtistCredit.required).toEqual(["role", "note"]);
    expect(openApiDocument.components.schemas.ArtistRelation.required).toEqual(["staff", "credits"]);
    expect(openApiDocument.components.schemas.ArtistWork.required).toEqual(["vn", "credits"]);
    expect(openApiDocument.components.schemas.ArtistWorkPage.required)
      .toEqual(["items", "page", "pageSize", "more"]);

    const detail = openApiDocument.paths["/artists/{id}"].get;
    const works = openApiDocument.paths["/artists/{id}/vns"].get;
    expect(detail.responses["200"].description).toContain("300 seconds");
    expect(works.responses["200"].description).toContain("60 seconds");
    expect(works.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "page", in: "query" }),
      expect.objectContaining({ name: "pageSize", in: "query" }),
    ]));
  });

  it("documents every error status reachable from artist handlers", () => {
    for (const path of ["/artists/{id}", "/artists/{id}/vns"] as const) {
      const responses = openApiDocument.paths[path].get.responses;
      expect(responses).toHaveProperty("400");
      expect(responses).toHaveProperty("429");
      expect(responses).toHaveProperty("502");
    }
  });

  it("keeps the standalone docs page free of favicon requests", () => {
    expect(openApiDocsHtml()).toContain('<link rel="icon" href="data:,">');
  });

  it("documents request priority and scheduling response headers", () => {
    const operation = openApiDocument.paths["/vns/{id}"].get;
    expect(operation.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "X-Request-Priority", in: "header" }),
    ]));
    expect(operation.responses["200"].headers).toMatchObject({
      "Server-Timing": expect.any(Object),
      "X-Request-Priority": expect.any(Object),
    });
  });

  it("documents timeout responses for every VNDB-backed operation", () => {
    const paths = [
      "/search",
      "/vns/{id}",
      "/characters/{id}",
      "/staff/{id}",
      "/staff/{id}/characters",
      "/artists/{id}",
      "/artists/{id}/vns",
      "/tags/{id}",
      "/tags/{id}/vns",
    ] as const;

    for (const path of paths) {
      expect(openApiDocument.paths[path].get.responses).toHaveProperty("504");
    }
  });
});
