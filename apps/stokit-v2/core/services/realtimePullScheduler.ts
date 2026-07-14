export function createDebouncedPullScheduler(pull: () => Promise<void>, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pulling = false;
  let followUpRequested = false;
  let idleWaiters: Array<() => void> = [];

  const resolveIdle = () => {
    if (timer || pulling || followUpRequested) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  };

  const run = async () => {
    if (pulling) {
      followUpRequested = true;
      return;
    }
    pulling = true;
    try {
      await pull();
    } finally {
      pulling = false;
      if (followUpRequested) {
        followUpRequested = false;
        schedule();
      } else {
        resolveIdle();
      }
    }
  };

  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
  };

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    followUpRequested = false;
    resolveIdle();
  };

  const whenIdle = (): Promise<void> => {
    if (!timer && !pulling && !followUpRequested) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.push(resolve));
  };

  return { schedule, cancel, whenIdle };
}
