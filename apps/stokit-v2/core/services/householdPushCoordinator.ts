import type { DurableState } from '../../types';
import {
  durableStateSemanticFingerprint,
  mergeDurableSnapshotForPush,
} from './mergeDurableSnapshot';

export { durableStateSemanticFingerprint } from './mergeDurableSnapshot';

export type PushCoordinatorPhase = 'idle' | 'pushing' | 'contended' | 'offline-backoff';

export type PushAttemptOutcome =
  | { type: 'success'; serverState: DurableState; updatedAt: number }
  | { type: 'conflict' }
  | { type: 'network-failure'; error: unknown; transportSettled?: Promise<void> }
  | { type: 'permanent-error'; error: unknown };

export type PushCoordinatorState = {
  phase: PushCoordinatorPhase;
  activeSnapshot: DurableState | null;
  pendingSnapshot: DurableState | null;
  dirty: boolean;
  generation: number;
  lastAcknowledgedFingerprint: string | null;
  abortController: AbortController | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  offlineDelayMs: number;
};

type InstalledPushState = {
  acknowledgedState: DurableState;
  latestState: DurableState;
};

type CoordinatorDependencies = {
  readLatestSnapshot: (householdId: string) => Promise<DurableState>;
  attempt: (
    householdId: string,
    snapshot: DurableState,
    signal: AbortSignal,
    generation: number,
  ) => Promise<PushAttemptOutcome>;
  installSuccess: (
    householdId: string,
    submitted: DurableState,
    serverState: DurableState,
    updatedAt: number,
    generation: number,
  ) => Promise<InstalledPushState>;
  onPermanentError?: (householdId: string, error: unknown) => void;
  random?: () => number;
  delay?: (ms: number) => Promise<void>;
  setTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

type InternalCoordinatorState = PushCoordinatorState & {
  draining: Promise<void> | null;
  transportBarrier: Promise<void> | null;
};

const CAS_ATTEMPTS = 6;
const CAS_JITTER_MIN_MS = 25;
const CAS_JITTER_RANGE_MS = 100;
const CONTENTION_DELAY_MIN_MS = 200;
const CONTENTION_DELAY_RANGE_MS = 200;
const OFFLINE_INITIAL_DELAY_MS = 2_000;
const OFFLINE_MAX_DELAY_MS = 30_000;
export const PUSH_TIMEOUT_MS = 10_000;

export class PushRequestTimeoutError extends Error {
  constructor(message: string, readonly transportSettled: Promise<void>) {
    super(message);
  }
}

export function classifySupabasePushError(
  error: unknown,
  status?: number,
): 'network' | 'permanent' {
  const candidate = error as { name?: string; message?: string; code?: string } | null;
  const message = candidate?.message ?? '';
  if (
    status === 0 ||
    error instanceof TypeError ||
    candidate?.name === 'TypeError' ||
    (candidate?.code === '' && /network request failed|failed to fetch|fetcherror|networkerror/i.test(message))
  ) return 'network';
  return 'permanent';
}

export async function withPushAbort<T>(
  parentSignal: AbortSignal,
  query: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = PUSH_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const queryPromise = Promise.resolve().then(() => query(controller.signal));
  const transportSettled = queryPromise.then(() => undefined, () => undefined);
  let rejectAbort: ((error: Error) => void) | null = null;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abortFromParent = () => {
    controller.abort();
    rejectAbort?.(new Error('push aborted'));
  };
  parentSignal.addEventListener('abort', abortFromParent, { once: true });
  if (parentSignal.aborted) abortFromParent();
  let timeoutTimer: ReturnType<typeof setTimeout>;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeoutTimer = setTimeout(() => {
      reject(new PushRequestTimeoutError(`push timed out after ${timeoutMs}ms`, transportSettled));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      queryPromise,
      timedOut,
      aborted,
    ]);
  } finally {
    clearTimeout(timeoutTimer!);
    parentSignal.removeEventListener('abort', abortFromParent);
  }
}

function newerSnapshot(
  current: DurableState | null,
  candidate: DurableState,
): DurableState {
  if (!current) return candidate;
  return mergeDurableSnapshotForPush(current, candidate);
}

export function createHouseholdPushCoordinator(dependencies: CoordinatorDependencies) {
  const states = new Map<string, InternalCoordinatorState>();
  const random = dependencies.random ?? Math.random;
  const delay = dependencies.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const setTimer = dependencies.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = dependencies.clearTimer ?? ((timer) => clearTimeout(timer));

  const coordinatorState = (householdId: string): InternalCoordinatorState => {
    const existing = states.get(householdId);
    if (existing) return existing;
    const created: InternalCoordinatorState = {
      phase: 'idle',
      activeSnapshot: null,
      pendingSnapshot: null,
      dirty: false,
      generation: 0,
      lastAcknowledgedFingerprint: null,
      abortController: null,
      retryTimer: null,
      offlineDelayMs: 0,
      draining: null,
      transportBarrier: null,
    };
    states.set(householdId, created);
    return created;
  };

  const scheduleRetry = (
    householdId: string,
    state: InternalCoordinatorState,
    phase: 'contended' | 'offline-backoff',
    ms: number,
    transportBarrier?: Promise<void>,
  ) => {
    state.phase = phase;
    if (transportBarrier) {
      // The barrier is the ABANDONED request's transport promise, which only
      // settles when the underlying fetch does. A hung socket — exactly what a
      // PUSH_TIMEOUT_MS timeout implies — leaves it pending forever, and both
      // places that consult it block indefinitely: startDrain() returns early
      // while a barrier exists, and resume() awaits it. That stranded dirty
      // state permanently, with no enqueue, wake, realtime, or foreground
      // event able to restart the drain.
      //
      // Bound the wait. Overlap safety was never the barrier's job: a late
      // transport is rejected server-side by CAS on updated_at and discarded
      // client-side by the generation guards in runDrain. The barrier only
      // avoids a wasted attempt, so capping it costs nothing.
      const boundedBarrier = Promise.race([transportBarrier, delay(PUSH_TIMEOUT_MS)]);
      state.transportBarrier = boundedBarrier;
      void boundedBarrier.then(() => {
        if (state.transportBarrier === boundedBarrier) state.transportBarrier = null;
      });
    }
    if (state.retryTimer) clearTimer(state.retryTimer);
    const scheduledGeneration = state.generation;
    state.retryTimer = setTimer(() => {
      state.retryTimer = null;
      const resume = async () => {
        if (state.transportBarrier) await state.transportBarrier;
        if (states.get(householdId) !== state || state.generation !== scheduledGeneration) return;
        startDrain(householdId);
      };
      void resume();
    }, ms);
  };

  const runDrain = async (householdId: string, state: InternalCoordinatorState): Promise<void> => {
    while (state.dirty || state.pendingSnapshot) {
      const latest = await dependencies.readLatestSnapshot(householdId);
      const submitted = newerSnapshot(state.pendingSnapshot, latest);
      const submittedFingerprint = durableStateSemanticFingerprint(submitted);
      state.pendingSnapshot = null;
      state.dirty = false;

      if (state.lastAcknowledgedFingerprint === submittedFingerprint) {
        state.phase = 'idle';
        state.activeSnapshot = null;
        state.abortController = null;
        continue;
      }

      state.phase = 'pushing';
      state.activeSnapshot = submitted;
      const generation = state.generation + 1;
      state.generation = generation;
      const abortController = new AbortController();
      state.abortController = abortController;

      let outcome: PushAttemptOutcome = { type: 'conflict' };
      let attemptedSnapshot = submitted;
      for (let attempt = 1; attempt <= CAS_ATTEMPTS; attempt += 1) {
        const freshest = attempt === 1
          ? submitted
          : newerSnapshot(state.pendingSnapshot, await dependencies.readLatestSnapshot(householdId));
        attemptedSnapshot = freshest;
        state.activeSnapshot = freshest;
        outcome = await dependencies.attempt(
          householdId,
          freshest,
          abortController.signal,
          generation,
        );
        if (outcome.type !== 'conflict') break;
        if (attempt < CAS_ATTEMPTS) {
          await delay(CAS_JITTER_MIN_MS + Math.floor(random() * (CAS_JITTER_RANGE_MS + 1)));
        }
      }

      if (generation !== state.generation) return;
      state.activeSnapshot = null;
      state.abortController = null;

      if (outcome.type === 'success') {
        const installed = await dependencies.installSuccess(
          householdId,
          attemptedSnapshot,
          outcome.serverState,
          outcome.updatedAt,
          generation,
        );
        if (generation !== state.generation) return;
        state.lastAcknowledgedFingerprint = durableStateSemanticFingerprint(installed.acknowledgedState);
        state.offlineDelayMs = 0;
        const latestAfterInstall = newerSnapshot(
          newerSnapshot(state.pendingSnapshot, installed.latestState),
          await dependencies.readLatestSnapshot(householdId),
        );
        if (durableStateSemanticFingerprint(latestAfterInstall) !== state.lastAcknowledgedFingerprint) {
          state.pendingSnapshot = latestAfterInstall;
          state.dirty = true;
          continue;
        }
        state.pendingSnapshot = null;
        state.dirty = false;
        state.phase = 'idle';
        continue;
      }

      state.pendingSnapshot = newerSnapshot(state.pendingSnapshot, await dependencies.readLatestSnapshot(householdId));
      state.dirty = true;
      if (outcome.type === 'conflict') {
        scheduleRetry(
          householdId,
          state,
          'contended',
          CONTENTION_DELAY_MIN_MS + Math.floor(random() * (CONTENTION_DELAY_RANGE_MS + 1)),
        );
        return;
      }
      if (outcome.type === 'network-failure') {
        state.offlineDelayMs = state.offlineDelayMs > 0
          ? Math.min(state.offlineDelayMs * 2, OFFLINE_MAX_DELAY_MS)
          : OFFLINE_INITIAL_DELAY_MS;
        scheduleRetry(
          householdId,
          state,
          'offline-backoff',
          state.offlineDelayMs,
          outcome.transportSettled,
        );
        return;
      }

      state.phase = 'idle';
      dependencies.onPermanentError?.(householdId, outcome.error);
      return;
    }
    state.phase = 'idle';
  };

  const startDrain = (householdId: string): Promise<void> => {
    const state = coordinatorState(householdId);
    if (state.draining || state.phase === 'pushing') return state.draining ?? Promise.resolve();
    if (state.transportBarrier) return Promise.resolve();
    if (state.retryTimer) {
      clearTimer(state.retryTimer);
      state.retryTimer = null;
    }
    state.draining = runDrain(householdId, state).finally(() => {
      state.draining = null;
    });
    return state.draining;
  };

  const enqueue = async (householdId: string, snapshot: DurableState): Promise<void> => {
    const state = coordinatorState(householdId);
    state.pendingSnapshot = newerSnapshot(state.pendingSnapshot, snapshot);
    state.dirty = true;
    if (state.phase === 'offline-backoff' || state.phase === 'contended') return;
    await startDrain(householdId);
  };

  const wake = (householdId: string): Promise<void> => {
    const state = coordinatorState(householdId);
    if (!state.dirty && !state.pendingSnapshot) return Promise.resolve();
    return startDrain(householdId);
  };

  const whenSettled = async (householdId: string): Promise<void> => {
    const state = coordinatorState(householdId);
    if (state.draining) await state.draining;
  };

  const inspect = (householdId: string): PushCoordinatorState => {
    const { draining: _draining, ...state } = coordinatorState(householdId);
    return { ...state };
  };

  const reset = () => {
    for (const state of states.values()) {
      state.generation += 1;
      state.abortController?.abort();
      if (state.retryTimer) clearTimer(state.retryTimer);
    }
    states.clear();
  };

  return { enqueue, wake, whenSettled, inspect, reset };
}
