type TimerHandle = ReturnType<typeof setTimeout>;

export type PollingTimer = {
  clear(handle: TimerHandle): void;
  set(callback: () => void, delayMs: number): TimerHandle;
};

const systemTimer: PollingTimer = {
  clear: (handle) => clearTimeout(handle),
  set: (callback, delayMs) => setTimeout(callback, delayMs),
};

export function createPollingLifecycle(isHidden: () => boolean, timer: PollingTimer = systemTimer) {
  let generation = 0;
  let pendingTimer: TimerHandle | null = null;
  const clear = () => {
    if (pendingTimer === null) return;
    timer.clear(pendingTimer);
    pendingTimer = null;
  };
  const isActive = (token: number) => token === generation && !isHidden();

  return {
    begin(): number {
      generation += 1;
      clear();
      return generation;
    },
    invalidate(token: number): void {
      if (token === generation) generation += 1;
      clear();
    },
    isActive,
    pause: clear,
    schedule(token: number, delayMs: number, callback: () => void): void {
      if (!isActive(token)) return;
      clear();
      pendingTimer = timer.set(() => {
        pendingTimer = null;
        if (isActive(token)) callback();
      }, delayMs);
    },
  };
}
