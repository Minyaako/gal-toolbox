import { CancelledError } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { shouldRetryQuery } from "./query-client";

describe("query retry policy", () => {
  it("does not retry client cancellation", () => {
    expect(shouldRetryQuery(0, new DOMException("aborted", "AbortError"))).toBe(false);
    expect(shouldRetryQuery(0, new CancelledError())).toBe(false);
  });

  it("retries an ordinary first failure", () => {
    expect(shouldRetryQuery(0, new Error("temporary"))).toBe(true);
  });
});
