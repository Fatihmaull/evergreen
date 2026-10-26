/**
 * Fixed-window rate limits (docs/API.md §3). Required, not polish: without
 * them, passwordless login makes the sign-in form a free mail relay (ADR-008).
 *
 * The counter lives behind `CounterStore` so the same logic runs on Neon rows
 * (`PH2-E2-03`), on another store, or in memory for tests. The store's
 * `increment` must be atomic, or two concurrent requests both read "under".
 */
export interface CounterStore {
  /** Adds one to `key`'s count and returns the new count. Atomic. */
  increment(key: string): Promise<number>;
}

export interface Limit {
  readonly limit: number;
  /** Seconds. */
  readonly window: number;
}

export type RateDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

/**
 * Counts this request against `scope:subject` in the current window, and says
 * whether it is allowed. A refused request still counts, so hammering a
 * refused route does not reopen it sooner.
 */
export async function hitLimit(
  store: CounterStore,
  args: {
    readonly scope: string;
    readonly subject: string;
    readonly limit: Limit;
    readonly now: number;
  },
): Promise<RateDecision> {
  const windowStart = args.now - (args.now % args.limit.window);
  const count = await store.increment(`${args.scope}:${args.subject}:${windowStart}`);
  if (count <= args.limit.limit) return { allowed: true };
  return { allowed: false, retryAfterSeconds: windowStart + args.limit.window - args.now };
}

/** For tests and local runs only: never shared between Worker isolates. */
export class MemoryCounterStore implements CounterStore {
  private readonly counts = new Map<string, number>();
  increment(key: string): Promise<number> {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return Promise.resolve(next);
  }
}
