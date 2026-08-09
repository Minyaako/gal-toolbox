import { describe, expect, it } from "vitest";
import { entityPath } from "./api";

describe("entityPath", () => {
  it("maps every public entity type to a stable route", () => {
    expect(entityPath({ id: "v17", type: "vn" })).toBe("/vn/v17");
    expect(entityPath({ id: "c30", type: "character" })).toBe("/character/c30");
    expect(entityPath({ id: "s81", type: "staff" })).toBe("/staff/s81");
    expect(entityPath({ id: "g7", type: "tag" })).toBe("/tag/g7");
  });
});
