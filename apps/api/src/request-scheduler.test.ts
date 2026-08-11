import { describe, expect, it } from "vitest";
import { RequestScheduler } from "./request-scheduler.js";

type Timer = { at: number; callback: () => void; cancelled: boolean };

function controlledClock() {
  let current = 0;
  const timers: Timer[] = [];
  const runDue = () => {
    for (;;) {
      const next = timers
        .filter((timer) => !timer.cancelled && timer.at <= current)
        .sort((left, right) => left.at - right.at)[0];
      if (!next) return;
      next.cancelled = true;
      next.callback();
    }
  };
  return {
    now: () => current,
    setTimer(callback: () => void, delayMs: number) {
      const timer = { at: current + delayMs, callback, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer: Timer) {
      timer.cancelled = true;
    },
    advance(ms: number) {
      current += ms;
      runDue();
    },
    advanceToNextTimer() {
      const next = timers
        .filter((timer) => !timer.cancelled)
        .sort((left, right) => left.at - right.at)[0];
      if (next) {
        current = next.at;
        runDue();
      }
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const flushScheduler = async () => {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
};

function harness() {
  const clock = controlledClock();
  const starts: string[] = [];
  const work = new Map<string, ReturnType<typeof deferred<string>>>();
  const signals = new Map<string, AbortSignal>();
  const scheduler = new RequestScheduler({
    intervalMs: 1_500,
    maxConcurrent: 2,
    agingMs: 8_000,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  const schedule = (
    key: string,
    priority: "high" | "normal" | "low",
    signal?: AbortSignal,
  ) => scheduler.schedule({
    key,
    priority,
    signal,
    run: (workSignal) => {
      starts.push(key);
      signals.set(key, workSignal);
      const pending = deferred<string>();
      work.set(key, pending);
      return pending.promise;
    },
  });
  return { clock, starts, work, signals, schedule };
}

describe("RequestScheduler", () => {
  it("starts higher-priority queued work before normal work", async () => {
    const { schedule, starts, work, clock } = harness();
    const low = schedule("low-1", "low");
    await flushScheduler();
    expect(starts).toEqual(["low-1"]);

    const normal = schedule("normal-1", "normal");
    const high = schedule("high-1", "high");
    work.get("low-1")?.resolve("low-1");
    await low;
    clock.advanceToNextTimer();
    await flushScheduler();
    expect(starts).toEqual(["low-1", "high-1"]);

    work.get("high-1")?.resolve("high-1");
    await high;
    clock.advanceToNextTimer();
    await flushScheduler();
    work.get("normal-1")?.resolve("normal-1");
    await expect(normal).resolves.toMatchObject({ value: "normal-1" });
  });

  it("keeps FIFO order within equal priorities", async () => {
    const { schedule, starts, work, clock } = harness();
    const first = schedule("first", "normal");
    const second = schedule("second", "normal");
    const third = schedule("third", "normal");
    await flushScheduler();
    expect(starts).toEqual(["first"]);
    work.get("first")?.resolve("first");
    await first;
    clock.advanceToNextTimer();
    await flushScheduler();
    expect(starts).toEqual(["first", "second"]);
    work.get("second")?.resolve("second");
    await second;
    clock.advanceToNextTimer();
    await flushScheduler();
    expect(starts).toEqual(["first", "second", "third"]);
    work.get("third")?.resolve("third");
    await third;
  });

  it("limits unresolved work to two and spaces starts by 1500 ms", async () => {
    const clock = controlledClock();
    const starts: number[] = [];
    let running = 0;
    let maximumRunning = 0;
    const pending: Array<ReturnType<typeof deferred<void>>> = [];
    const scheduler = new RequestScheduler({
      intervalMs: 1_500,
      maxConcurrent: 2,
      agingMs: 8_000,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    const jobs = [0, 1, 2, 3].map((key) => scheduler.schedule({
      key: String(key),
      priority: "normal" as const,
      run: async () => {
        starts.push(clock.now());
        running += 1;
        maximumRunning = Math.max(maximumRunning, running);
        const item = deferred<void>();
        pending.push(item);
        await item.promise;
        running -= 1;
      },
    }));
    await flushScheduler();
    clock.advance(1_500);
    await flushScheduler();
    clock.advance(10_000);
    await flushScheduler();
    expect(starts).toEqual([0, 1_500]);
    expect(maximumRunning).toBe(2);
    pending[0].resolve();
    await flushScheduler();
    expect(starts).toEqual([0, 1_500, 11_500]);
    pending[1].resolve();
    clock.advance(1_500);
    await flushScheduler();
    pending[2].resolve();
    pending[3].resolve();
    await Promise.all(jobs);
    expect(starts.every((time, index) => index === 0 || time - starts[index - 1] >= 1_500)).toBe(true);
    expect(maximumRunning).toBe(2);
  });

  it("promotes a low item after 8000 ms so it eventually starts", async () => {
    const { schedule, starts, work, clock } = harness();
    const blocker = schedule("blocker", "normal");
    const low = schedule("aged-low", "low");
    await flushScheduler();
    clock.advance(8_000);
    const newerNormal = schedule("new-normal", "normal");
    work.get("blocker")?.resolve("blocker");
    await blocker;
    await flushScheduler();
    expect(starts).toEqual(["blocker", "aged-low"]);
    work.get("aged-low")?.resolve("aged-low");
    await expect(low).resolves.toMatchObject({ priority: "normal" });
    clock.advanceToNextTimer();
    await flushScheduler();
    work.get("new-normal")?.resolve("new-normal");
    await newerNormal;
  });

  it("removes a queued sole consumer when it aborts without running work", async () => {
    const { schedule, starts, clock, work } = harness();
    const blocker = schedule("blocker", "normal");
    const controller = new AbortController();
    const cancelled = schedule("cancelled", "normal", controller.signal);
    const rejection = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejection;
    work.get("blocker")?.resolve("blocker");
    await blocker;
    clock.advanceToNextTimer();
    await flushScheduler();
    expect(starts).toEqual(["blocker"]);
  });

  it("aborts running work when its final consumer aborts", async () => {
    const { schedule, signals } = harness();
    const controller = new AbortController();
    const running = schedule("running", "normal", controller.signal);
    const rejection = expect(running).rejects.toMatchObject({ name: "AbortError" });
    await flushScheduler();
    controller.abort();
    await rejection;
    expect(signals.get("running")?.aborted).toBe(true);
  });

  it("keeps shared running work alive when only one consumer aborts", async () => {
    const { schedule, signals, work } = harness();
    const prefetchController = new AbortController();
    const prefetch = schedule("shared", "low", prefetchController.signal);
    await flushScheduler();
    const detail = schedule("shared", "high");
    const rejection = expect(prefetch).rejects.toMatchObject({ name: "AbortError" });
    prefetchController.abort();
    await rejection;
    expect(signals.get("shared")?.aborted).toBe(false);
    work.get("shared")?.resolve("shared-result");
    await expect(detail).resolves.toMatchObject({ value: "shared-result" });
  });

  it("raises queued same-key low work above unrelated normal work", async () => {
    const { schedule, starts, work, clock } = harness();
    const blocker = schedule("blocker", "normal");
    const low = schedule("shared", "low");
    const unrelated = schedule("unrelated", "normal");
    const detail = schedule("shared", "high");
    await flushScheduler();
    work.get("blocker")?.resolve("blocker");
    await blocker;
    clock.advanceToNextTimer();
    await flushScheduler();
    expect(starts).toEqual(["blocker", "shared"]);
    work.get("shared")?.resolve("shared");
    await Promise.all([low, detail]);
    clock.advanceToNextTimer();
    await flushScheduler();
    work.get("unrelated")?.resolve("unrelated");
    await unrelated;
  });
});
