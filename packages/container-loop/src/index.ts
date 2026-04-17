import type { Container, ContainerInstance } from '@facet/core';

const BASE_INTERVAL_MS = 1200;

export const loopContainer: Container = {
  id: 'loop',

  init(): ContainerInstance {
    const tickCallbacks = new Set<() => void>();
    const completeCallbacks = new Set<() => void>();
    let speedMul = 1;
    let tickCount = 0;
    let running = false;
    let complete = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    function currentInterval(): number {
      const mul = speedMul <= 0 ? 1 : speedMul;
      return Math.max(50, BASE_INTERVAL_MS / mul);
    }

    function emitTick() {
      if (complete) {
        stop();
        return;
      }
      tickCount++;
      for (const cb of [...tickCallbacks]) cb();
    }

    function start() {
      if (complete || running) return;
      running = true;
      emitTick();
      if (running) {
        timer = setInterval(emitTick, currentInterval());
      }
    }

    function stop() {
      running = false;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    }

    function reset() {
      stop();
      tickCount = 0;
      complete = false;
    }

    function signalComplete() {
      if (complete) return;
      complete = true;
      stop();
      for (const cb of [...completeCallbacks]) cb();
    }

    function setSpeed(mul: number) {
      speedMul = mul;
      if (running) {
        if (timer !== null) {
          clearInterval(timer);
          timer = null;
        }
        timer = setInterval(emitTick, currentInterval());
      }
    }

    return {
      start,
      stop,
      reset,
      signalComplete,
      onTick: (cb) => {
        tickCallbacks.add(cb);
        return () => tickCallbacks.delete(cb);
      },
      onComplete: (cb) => {
        completeCallbacks.add(cb);
        return () => completeCallbacks.delete(cb);
      },
      setSpeed,
      getState: () => ({ tickCount, running, complete }),
    };
  },
};
