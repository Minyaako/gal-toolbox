import { describe, expect, it } from "vitest";
import { openApiDocsHtml, openApiDocument } from "./openapi.js";

describe("OpenAPI document", () => {
  it("publishes the current version and tag exploration paths", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(openApiDocument.info.version).toBe("1.2.0");
    expect(openApiDocument.paths).toHaveProperty("/tags/{id}");
    expect(openApiDocument.paths).toHaveProperty("/tags/{id}/vns");
    expect(openApiDocument.paths["/search"].get.description).toContain("Chinese");
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
      "/tags/{id}",
      "/tags/{id}/vns",
    ] as const;

    for (const path of paths) {
      expect(openApiDocument.paths[path].get.responses).toHaveProperty("504");
    }
  });
});
