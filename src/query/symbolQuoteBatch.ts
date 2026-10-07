/** Stage only the latest symbol values; copy the full React snapshot once per commit. */
export class SymbolQuoteBatch<T> {
  private readonly pending = new Map<string, T>();

  get(symbol: string, committed: Record<string, T>): T | undefined {
    return this.pending.get(symbol) ?? committed[symbol];
  }

  set(symbol: string, value: T): void {
    this.pending.set(symbol, value);
  }

  commit(committed: Record<string, T>): Record<string, T> {
    if (this.pending.size === 0) return committed;
    const next = { ...committed };
    this.pending.forEach((value, symbol) => { next[symbol] = value; });
    this.pending.clear();
    return next;
  }

  clear(): void {
    this.pending.clear();
  }
}
