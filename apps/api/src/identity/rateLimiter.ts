// Fixed-window in-memory limiter; enough for a single-process LAN service.
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {}

  allow(key: string): boolean {
    const current = this.now();
    const entry = this.windows.get(key);
    if (!entry || current - entry.start >= this.windowMs) {
      if (this.windows.size > 10_000) {
        this.prune(current);
      }
      this.windows.set(key, { start: current, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  private prune(current: number): void {
    for (const [key, entry] of this.windows) {
      if (current - entry.start >= this.windowMs) {
        this.windows.delete(key);
      }
    }
  }
}
