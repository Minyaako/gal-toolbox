import { describe, expect, it } from "vitest";
import { openApiDocsHtml, openApiDocument } from "./openapi.js";

describe("OpenAPI document", () => {
  it("publishes the current version and tag exploration paths", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(openApiDocument.paths).toHaveProperty("/tags/{id}");
    expect(openApiDocument.paths).toHaveProperty("/tags/{id}/vns");
  });

  it("keeps the standalone docs page free of favicon requests", () => {
    expect(openApiDocsHtml()).toContain('<link rel="icon" href="data:,">');
  });
});
