export function createLatestSnapshotQueue<T>(run: (value: T) => Promise<void>) {
  let pending: T | null = null;
  let draining: Promise<void> | null = null;

  const drain = async () => {
    while (pending !== null) {
      const next = pending;
      pending = null;
      await run(next);
    }
  };

  const enqueue = (value: T): Promise<void> => {
    pending = value;
    if (!draining) {
      draining = drain().finally(() => {
        draining = null;
        if (pending !== null) void enqueue(pending);
      });
    }
    return draining;
  };

  const whenIdle = async (): Promise<void> => {
    while (draining) await draining;
  };

  return { enqueue, whenIdle };
}
