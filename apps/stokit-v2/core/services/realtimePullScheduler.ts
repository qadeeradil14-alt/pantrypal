export function createDebouncedPullScheduler(
  pull: () => Promise<boolean | void>,
  delayMs: number,
  retryDelayMs = 2_000,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pulling = false;
  let followUpRequested = false;
  let idleWaiters: Array<() => void> = [];
  let generation = 0;

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
    const runGeneration = generation;
    let retryRequested = false;
    try {
      retryRequested = (await pull()) === false;
    } catch {
      retryRequested = true;
    } finally {
      pulling = false;
      if (runGeneration !== generation) {
        if (followUpRequested) {
          followUpRequested = false;
          schedule();
        } else {
          resolveIdle();
        }
        return;
      }
      if (followUpRequested) {
        followUpRequested = false;
        schedule();
      } else if (retryRequested) {
        schedule(retryDelayMs);
      } else {
        resolveIdle();
      }
    }
  };

  const schedule = (waitMs = delayMs) => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, waitMs);
  };

  const cancel = () => {
    generation += 1;
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
