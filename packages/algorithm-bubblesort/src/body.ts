import type { Body, BodyInstance } from '@facet/core';
import { renderBars, updateBars, type BarsView } from './render.js';

export type BubbleSortState = {
  arr: number[];
  pass: number;
  i: number;
  comparisons: number;
  swaps: number;
  bodyState: 'ready' | 'running' | 'complete';
  microPhase: 'comparing' | 'swapping' | 'settled' | null;
  lastComp: [number, number] | null;
  lastSwap: [number, number] | null;
  size: number;
  distribution: string;
};

const MICRO_DELAY_MS = 350;

export const bubbleSortBars: Body = {
  id: 'bubbleSort-bars',
  algorithm: 'bubbleSort',
  available_irs: ['bubbleSort-imperative', 'bubbleSort-functional'],
  default_ir: 'bubbleSort-imperative',
  controls: [
    {
      type: 'preset',
      id: 'distribution',
      label: '분포',
      options: [
        { value: 'random', label: '랜덤' },
        { value: 'reversed', label: '역순' },
        { value: 'nearly', label: '거의 정렬' },
      ],
      default: 'reversed',
    },
    {
      type: 'range',
      id: 'size',
      label: '개수',
      min: 4,
      max: 9,
      default: 5,
      step: 1,
    },
  ],

  init(): BodyInstance {
    let arr: number[] = [];
    let i = 0;
    let pass = 0;
    let swappedThisPass = false;
    let comparisons = 0;
    let swaps = 0;
    let lastComp: [number, number] | null = null;
    let lastSwap: [number, number] | null = null;
    let bodyState: BubbleSortState['bodyState'] = 'ready';
    let microPhase: BubbleSortState['microPhase'] = null;
    let speedMul = 1;
    let distribution = 'reversed';
    let size = 5;
    let view: BarsView | null = null;
    let pendingTimers = new Set<ReturnType<typeof setTimeout>>();

    const phaseCallbacks = new Set<(p: string) => void>();
    const completeCallbacks = new Set<() => void>();
    const stateCallbacks = new Set<(s: Record<string, unknown>) => void>();

    function microDelay(): number {
      const mul = speedMul <= 0 ? 1 : speedMul;
      return Math.max(30, MICRO_DELAY_MS / mul);
    }

    function scheduleMicro(fn: () => void): void {
      const t = setTimeout(() => {
        pendingTimers.delete(t);
        fn();
      }, microDelay());
      pendingTimers.add(t);
    }

    function cancelPendingMicros(): void {
      for (const t of pendingTimers) clearTimeout(t);
      pendingTimers.clear();
    }

    function snapshot(): BubbleSortState {
      return {
        arr: [...arr],
        pass,
        i,
        comparisons,
        swaps,
        bodyState,
        microPhase,
        lastComp: lastComp ? [...lastComp] : null,
        lastSwap: lastSwap ? [...lastSwap] : null,
        size,
        distribution,
      };
    }

    function emitPhase(p: string) {
      for (const cb of [...phaseCallbacks]) cb(p);
    }

    function emitState() {
      const s = snapshot();
      for (const cb of [...stateCallbacks]) cb(s as unknown as Record<string, unknown>);
      if (view) updateBars(view, s);
    }

    function genArray() {
      if (distribution === 'random') {
        const pool = Array.from({ length: size }, (_, k) => k + 1);
        for (let k = pool.length - 1; k > 0; k--) {
          const j = Math.floor(Math.random() * (k + 1));
          [pool[k], pool[j]] = [pool[j], pool[k]];
        }
        arr = pool;
      } else if (distribution === 'reversed') {
        arr = Array.from({ length: size }, (_, k) => size - k);
      } else {
        arr = Array.from({ length: size }, (_, k) => k + 1);
        const swapsToDo = Math.max(1, Math.floor(size * 0.2));
        for (let s = 0; s < swapsToDo; s++) {
          const a = Math.floor(Math.random() * (size - 1));
          [arr[a], arr[a + 1]] = [arr[a + 1], arr[a]];
        }
      }
    }

    function resetState() {
      cancelPendingMicros();
      i = 0;
      pass = 0;
      swappedThisPass = false;
      comparisons = 0;
      swaps = 0;
      lastComp = null;
      lastSwap = null;
      bodyState = 'ready';
      microPhase = null;
      genArray();
      emitState();
    }

    function finishComplete() {
      bodyState = 'complete';
      microPhase = null;
      lastComp = null;
      lastSwap = null;
      emitPhase('pass_complete');
      emitState();
      for (const cb of [...completeCallbacks]) cb();
    }

    function tick() {
      if (bodyState === 'complete') return;
      bodyState = 'running';

      const limit = size - pass - 1;
      if (i >= limit) {
        pass++;
        if (!swappedThisPass) {
          finishComplete();
          return;
        }
        swappedThisPass = false;
        i = 0;
        const newLimit = size - pass - 1;
        if (newLimit <= 0) {
          finishComplete();
          return;
        }
        microPhase = null;
        emitPhase('outer_loop');
        emitState();
      }

      comparisons++;
      lastComp = [i, i + 1];
      const willSwap = arr[i] > arr[i + 1];
      if (!willSwap) lastSwap = null;
      microPhase = 'comparing';
      emitPhase('comparing');
      emitState();

      scheduleMicro(() => {
        if (willSwap) {
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
          swaps++;
          swappedThisPass = true;
          lastSwap = [i, i + 1];
          microPhase = 'swapping';
          emitPhase('swapping');
          emitState();
          scheduleMicro(() => {
            i++;
            microPhase = 'settled';
            emitState();
          });
        } else {
          i++;
          microPhase = 'settled';
          emitState();
        }
      });
    }

    function setControl(id: string, value: unknown) {
      if (id === 'distribution' && typeof value === 'string') distribution = value;
      if (id === 'size' && typeof value === 'number') size = value;
      resetState();
    }

    function setSpeed(mul: number) {
      speedMul = mul;
    }

    function render(mount: HTMLElement) {
      view = renderBars(mount);
      updateBars(view, snapshot());
    }

    function destroy() {
      cancelPendingMicros();
      phaseCallbacks.clear();
      completeCallbacks.clear();
      stateCallbacks.clear();
      view = null;
    }

    genArray();

    return {
      tick,
      reset: resetState,
      setControl,
      setSpeed,
      render,
      destroy,
      onPhase: (cb) => {
        phaseCallbacks.add(cb);
        return () => phaseCallbacks.delete(cb);
      },
      onComplete: (cb) => {
        completeCallbacks.add(cb);
        return () => completeCallbacks.delete(cb);
      },
      onStateChange: (cb) => {
        stateCallbacks.add(cb);
        return () => stateCallbacks.delete(cb);
      },
      getState: () => snapshot() as unknown as Record<string, unknown>,
    };
  },
};
