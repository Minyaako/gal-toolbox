export type RequestPriority = "high" | "normal" | "low";

export type ScheduledResult<T> = {
  value: T;
  queueWaitMs: number;
  upstreamDurationMs: number;
  queueDepth: number;
  priority: RequestPriority;
};

type TimerHandle = unknown;

type SchedulerOptions = {
  intervalMs?: number;
  maxConcurrent?: number;
  agingMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
};

type ScheduleOptions<T> = {
  key: string;
  priority: RequestPriority;
  signal?: AbortSignal | undefined;
  run: (signal: AbortSignal) => Promise<T>;
};

type Consumer<T> = {
  resolve: (result: ScheduledResult<T>) => void;
  reject: (reason: unknown) => void;
  signal: AbortSignal | undefined;
  onAbort: (() => void) | undefined;
};

type WorkItem<T> = {
  key: string;
  priority: RequestPriority;
  enqueuedAt: number;
  sequence: number;
  run: (signal: AbortSignal) => Promise<T>;
  controller: AbortController;
  consumers: Set<Consumer<T>>;
  state: "queued" | "running";
};

const priorityRank: Record<RequestPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
};

const rankPriority: RequestPriority[] = ["low", "normal", "high"];

function abortReason(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException("The request was aborted", "AbortError");
}

export class RequestScheduler {
  private readonly intervalMs: number;
  private readonly maxConcurrent: number;
  private readonly agingMs: number;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  private readonly clearTimer: (timer: TimerHandle) => void;
  private readonly items = new Map<string, WorkItem<unknown>>();
  private running = 0;
  private nextStartAt = 0;
  private sequence = 0;
  private wakeTimer: TimerHandle | undefined;

  constructor(options: SchedulerOptions = {}) {
    this.intervalMs = options.intervalMs ?? 1_500;
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.agingMs = options.agingMs ?? 8_000;
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  schedule<T>(options: ScheduleOptions<T>): Promise<ScheduledResult<T>> {
    if (options.signal?.aborted) {
      return Promise.reject(abortReason(options.signal));
    }

    let item = this.items.get(options.key) as WorkItem<T> | undefined;
    if (!item) {
      item = {
        key: options.key,
        priority: options.priority,
        enqueuedAt: this.now(),
        sequence: this.sequence++,
        run: options.run,
        controller: new AbortController(),
        consumers: new Set(),
        state: "queued",
      };
      this.items.set(options.key, item as WorkItem<unknown>);
    } else if (
      item.state === "queued" &&
      priorityRank[options.priority] > priorityRank[item.priority]
    ) {
      item.priority = options.priority;
    }

    const promise = new Promise<ScheduledResult<T>>((resolve, reject) => {
      const consumer: Consumer<T> = {
        resolve,
        reject,
        signal: options.signal,
        onAbort: undefined,
      };
      if (options.signal) {
        consumer.onAbort = () => this.cancelConsumer(item!, consumer);
        options.signal.addEventListener("abort", consumer.onAbort, { once: true });
      }
      item!.consumers.add(consumer);
    });

    this.pump();
    return promise;
  }

  private cancelConsumer<T>(item: WorkItem<T>, consumer: Consumer<T>): void {
    if (!item.consumers.delete(consumer)) return;
    this.detachAbortListener(consumer);
    consumer.reject(abortReason(consumer.signal));
    if (item.consumers.size > 0) return;

    if (item.state === "queued") {
      this.items.delete(item.key);
      this.pump();
    } else {
      if (this.items.get(item.key) === item) {
        this.items.delete(item.key);
      }
      item.controller.abort();
    }
  }

  private effectivePriority(item: WorkItem<unknown>, now: number): RequestPriority {
    const aged = now - item.enqueuedAt >= this.agingMs ? 1 : 0;
    return rankPriority[Math.min(2, priorityRank[item.priority] + aged)]!;
  }

  private nextQueued(): WorkItem<unknown> | undefined {
    const now = this.now();
    return [...this.items.values()]
      .filter((item) => item.state === "queued" && item.consumers.size > 0)
      .sort((left, right) => {
        const rankDifference =
          priorityRank[this.effectivePriority(right, now)] -
          priorityRank[this.effectivePriority(left, now)];
        return rankDifference || left.sequence - right.sequence;
      })[0];
  }

  private pump(): void {
    if (this.running >= this.maxConcurrent || !this.nextQueued()) {
      this.cancelWakeTimer();
      return;
    }

    const delayMs = Math.max(0, this.nextStartAt - this.now());
    if (delayMs > 0) {
      if (this.wakeTimer === undefined) {
        this.wakeTimer = this.setTimer(() => {
          this.wakeTimer = undefined;
          this.pump();
        }, delayMs);
      }
      return;
    }

    this.cancelWakeTimer();
    const item = this.nextQueued();
    if (!item) return;
    this.start(item);
    this.pump();
  }

  private start(item: WorkItem<unknown>): void {
    const startedAt = this.now();
    const queueDepth = [...this.items.values()].filter((candidate) => candidate.state === "queued").length - 1;
    const finalPriority = this.effectivePriority(item, startedAt);
    item.state = "running";
    this.running += 1;
    this.nextStartAt = startedAt + this.intervalMs;

    Promise.resolve()
      .then(() => item.run(item.controller.signal))
      .then(
        (value) => {
          const result: ScheduledResult<unknown> = {
            value,
            queueWaitMs: Math.max(0, startedAt - item.enqueuedAt),
            upstreamDurationMs: Math.max(0, this.now() - startedAt),
            queueDepth: Math.max(0, queueDepth),
            priority: finalPriority,
          };
          for (const consumer of item.consumers) {
            this.detachAbortListener(consumer);
            consumer.resolve(result);
          }
        },
        (error) => {
          for (const consumer of item.consumers) {
            this.detachAbortListener(consumer);
            consumer.reject(error);
          }
        },
      )
      .finally(() => {
        item.consumers.clear();
        if (this.items.get(item.key) === item) {
          this.items.delete(item.key);
        }
        this.running -= 1;
        this.pump();
      });
  }

  private detachAbortListener<T>(consumer: Consumer<T>): void {
    if (consumer.signal && consumer.onAbort) {
      consumer.signal.removeEventListener("abort", consumer.onAbort);
    }
  }

  private cancelWakeTimer(): void {
    if (this.wakeTimer !== undefined) {
      this.clearTimer(this.wakeTimer);
      this.wakeTimer = undefined;
    }
  }
}
