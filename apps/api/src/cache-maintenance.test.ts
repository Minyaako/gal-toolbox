import { afterEach, describe, expect, it, vi } from "vitest";
import { startCacheMaintenance } from "./cache-maintenance.js";

afterEach(() => vi.useRealTimers());

describe("startCacheMaintenance", () => {
  it("prunes hourly until stopped", () => {
    vi.useFakeTimers();
    let pruneCount = 0;
    const stop = startCacheMaintenance({
      prune: () => {
        pruneCount += 1;
      },
    });

    expect(pruneCount).toBe(0);
    vi.advanceTimersByTime(3_600_000);
    expect(pruneCount).toBe(1);

    stop();
    vi.advanceTimersByTime(3_600_000);
    expect(pruneCount).toBe(1);
  });

  it("reports cleanup failures and keeps the timer alive", () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    const failure = new Error("sqlite busy");
    const stop = startCacheMaintenance(
      {
        prune: () => {
          throw failure;
        },
      },
      { onError: (error) => errors.push(error) },
    );

    expect(() => vi.advanceTimersByTime(7_200_000)).not.toThrow();
    expect(errors).toEqual([failure, failure]);
    stop();
  });
});
