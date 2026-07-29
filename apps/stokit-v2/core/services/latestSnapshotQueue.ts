export function createLatestSnapshotQueue<T>(
  run: (value: T) => Promise<void>,
  debounceMs = 0,
) {
  let pending: T | null = null;
  let draining: Promise<void> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let failure: unknown;
  let idleWaiters: {
    resolve: () => void;
    reject: (error: unknown) => void;
  }[] = [];

  const drain = async () => {
    while (pending !== null) {
      const next = pending;
      pending = null;
      await run(next);
    }
  };

  const settleIfIdle = () => {
    if (pending !== null || draining || debounceTimer) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    const error = failure;
    failure = undefined;
    for (const waiter of waiters) {
      if (error !== undefined) waiter.reject(error);
      else waiter.resolve();
    }
  };

  const schedule = () => {
    if (draining || pending === null) return;
    if (debounceMs > 0) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        startDrain();
      }, debounceMs);
      return;
    }
    startDrain();
  };

  const startDrain = () => {
    if (draining || pending === null) return;
    draining = drain()
      .catch((error) => {
        failure ??= error;
      })
      .finally(() => {
        draining = null;
        if (pending !== null) schedule();
        else settleIfIdle();
      });
  };

  const whenIdle = (): Promise<void> => {
    if (pending === null && !draining && !debounceTimer) {
      if (failure !== undefined) {
        const error = failure;
        failure = undefined;
        return Promise.reject(error);
      }
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      idleWaiters.push({ resolve, reject });
    });
  };

  const enqueue = (value: T): Promise<void> => {
    pending = value;
    schedule();
    return whenIdle();
  };

  return { enqueue, whenIdle };
}
