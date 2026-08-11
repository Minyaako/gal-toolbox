import { describe, expect, it } from "vitest";
import type { EntitySummary } from "./api";
import { addTrailItem, isEntitySummary, normalizeTrail } from "./trail";

const staff: EntitySummary = {
  id: "s1928", type: "staff",
  name: { primary: "Artist", original: null, romanized: null, alternatives: [] }, image: null,
};

describe("path-aware exploration trails", () => {
  it("retains voice and artist contexts for the same staff summary", () => {
    const voicePath = "/knowledge/staff/s1928";
    const artPath = "/knowledge/artist/s1928";
    const next = addTrailItem(addTrailItem([], staff, voicePath), staff, artPath);
    expect(next.map((item) => item.path)).toEqual([voicePath, artPath]);
  });

  it("migrates legacy entity-only storage to its stable entity path", () => {
    expect(normalizeTrail([staff])).toEqual([{ entity: staff, path: "/knowledge/staff/s1928" }]);
  });

  it("rejects malformed stored items instead of exposing dereferenceable trail entries", () => {
    expect(normalizeTrail([{ entity: {}, path: "/knowledge/artist/s1928" }, { id: "s1" }, null])).toEqual([]);
  });

  it("validates both legacy and path-aware storage entities completely", () => {
    expect(isEntitySummary(staff)).toBe(true);
    expect(normalizeTrail([{ entity: { ...staff, name: null }, path: "/knowledge/staff/s1928" }, { ...staff, name: null }])).toEqual([]);
  });
});
