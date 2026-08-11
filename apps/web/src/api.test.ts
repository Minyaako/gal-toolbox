import { describe, expect, it } from "vitest";
import { entityPath } from "./api";

describe("entityPath", () => {
  it("maps every public entity type to a stable route", () => {
    expect(entityPath({ id: "v17", type: "vn" })).toBe("/knowledge/vn/v17");
    expect(entityPath({ id: "c30", type: "character" })).toBe("/knowledge/character/c30");
    expect(entityPath({ id: "s81", type: "staff" })).toBe("/knowledge/staff/s81");
    expect(entityPath({ id: "g7", type: "tag" })).toBe("/knowledge/tag/g7");
  });
});
