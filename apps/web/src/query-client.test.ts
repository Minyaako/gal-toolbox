import { CancelledError } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { shouldRetryQuery } from "./query-client";
import { ApiError } from "./api";

describe("query retry policy", () => {
  it("does not retry client cancellation", () => {
    expect(shouldRetryQuery(0, new DOMException("aborted", "AbortError"))).toBe(false);
    expect(shouldRetryQuery(0, new CancelledError())).toBe(false);
  });

  it("retries an ordinary first failure", () => {
    expect(shouldRetryQuery(0, new Error("temporary"))).toBe(true);
  });

  it("never retries timeout or rate-limit responses", () => {
    expect(shouldRetryQuery(0, new ApiError("timeout", 504, "UPSTREAM_TIMEOUT"))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError("rate", 429, "UPSTREAM_RATE_LIMITED"))).toBe(false);
  });

  it("allows only one retry for other retryable failures", () => {
    const error = new ApiError("upstream", 502, "UPSTREAM_UNAVAILABLE");
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(false);
  });
});
