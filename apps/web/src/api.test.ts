import { afterEach, describe, expect, it, vi } from "vitest";
import { entityPath, getVn } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("API request options", () => {
  it("forwards the exact signal and high request priority", async () => {
    const signal = new AbortController().signal;
    const fetcher = vi.fn(async () => new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetcher);

    await getVn("v17", { signal, priority: "high" });

    expect(fetcher).toHaveBeenCalledWith("/api/v1/vns/v17", {
      signal,
      headers: {
        Accept: "application/json",
        "X-Request-Priority": "high",
      },
    });
  });
});

describe("entityPath", () => {
  it("maps every public entity type to a stable route", () => {
    expect(entityPath({ id: "v17", type: "vn" })).toBe("/knowledge/vn/v17");
    expect(entityPath({ id: "c30", type: "character" })).toBe("/knowledge/character/c30");
    expect(entityPath({ id: "s81", type: "staff" })).toBe("/knowledge/staff/s81");
    expect(entityPath({ id: "g7", type: "tag" })).toBe("/knowledge/tag/g7");
  });
});
