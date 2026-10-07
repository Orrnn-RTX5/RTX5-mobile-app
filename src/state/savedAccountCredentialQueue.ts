/** Orders secure operations for one saved account without blocking other accounts. */
export function createSavedAccountCredentialQueue() {
  const pending = new Map<string, Promise<void>>();

  return function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = pending.get(key) ?? Promise.resolve();
    const result = previous.then(operation);
    // A failed write must still allow a following forget or replacement to run.
    const settled = result.then(() => undefined, () => undefined);
    pending.set(key, settled);
    void settled.then(() => {
      if (pending.get(key) === settled) pending.delete(key);
    });
    return result;
  };
}
