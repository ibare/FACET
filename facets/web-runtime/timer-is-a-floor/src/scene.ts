/**
 * timerIsAFloorScene — algorithm.ts 의 이벤트를 장면(상태)으로 잇는다.
 *
 * 바탕(init 이 정하는 것) — code · scriptLine · timers 의 구조(id·delayMs·busyMs·
 * 두 줄 인덱스). 자취(걸음이 쌓는 것) — queue · timers 의 scheduled/queued/actualMs/
 * latenessMs/runUntil. 이번 걸음(step) — 이 걸음에서 무엇이 일어났는지의 종류와 인자.
 */
import type { ScenePlan } from '@ffacet/core/runtime';
import type { TimerIsAFloorFacetData, TimerSpec } from './algorithm.js';

export interface TimerTrace {
  id: string;
  delayMs: number;
  busyMs: number;
  scheduleLine: number;
  callbackLine: number;
  /** 등록됐는가(schedule 이벤트를 받았는가). */
  scheduled: boolean;
  /** 태스크 줄에 서 있(었)는가. */
  queued: boolean;
  actualMs: number | null;
  latenessMs: number | null;
  runUntil: number | null;
}

export type TimerIsAFloorStep =
  | { kind: 'init' }
  | { kind: 'schedule'; id: string; delayMs: number }
  | { kind: 'due'; id: string }
  | { kind: 'scriptEnd'; at: number }
  | { kind: 'dequeue'; id: string; requestedMs: number; actualMs: number; latenessMs: number };

export interface TimerIsAFloorScene {
  code: string[];
  scriptLine: number;
  /** 지금까지 드러난 가장 늦은 시각(ms) — 타임라인 커서가 서는 자리. */
  now: number;
  stackBusy: boolean;
  queue: string[];
  timers: TimerTrace[];
  step: TimerIsAFloorStep;
}

function cloneTrace(t: TimerSpec): TimerTrace {
  return {
    id: t.id,
    delayMs: t.delayMs,
    busyMs: t.busyMs,
    scheduleLine: t.scheduleLine,
    callbackLine: t.callbackLine,
    scheduled: false,
    queued: false,
    actualMs: null,
    latenessMs: null,
    runUntil: null,
  };
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') return undefined;
    out.push(x);
  }
  return out;
}

export const timerIsAFloorScene: ScenePlan<TimerIsAFloorScene> = {
  initial(initialData) {
    const data = initialData as TimerIsAFloorFacetData;
    return {
      code: [...data.code],
      scriptLine: data.scriptLine,
      now: 0,
      stackBusy: true,
      queue: [],
      timers: data.timers.map(cloneTrace),
      step: { kind: 'init' },
    };
  },

  reduce(scene, event) {
    const p = event.payload as Record<string, unknown> | undefined;

    if (event.type === 'timer:schedule') {
      const id = typeof p?.id === 'string' ? p.id : undefined;
      const delayMs = typeof p?.delayMs === 'number' ? p.delayMs : undefined;
      const queued = typeof p?.queued === 'boolean' ? p.queued : undefined;
      const queue = asStringArray(p?.queue);
      if (id === undefined || delayMs === undefined || queued === undefined || queue === undefined) {
        throw new Error('timer-is-a-floor scene: timer:schedule payload 모양이 다르다');
      }
      return {
        ...scene,
        queue,
        timers: scene.timers.map((t) => (t.id === id ? { ...t, scheduled: true, queued } : t)),
        step: { kind: 'schedule', id, delayMs },
      };
    }

    if (event.type === 'timer:due') {
      const id = typeof p?.id === 'string' ? p.id : undefined;
      const queue = asStringArray(p?.queue);
      if (id === undefined || queue === undefined) {
        throw new Error('timer-is-a-floor scene: timer:due payload 모양이 다르다');
      }
      const timer = scene.timers.find((t) => t.id === id);
      if (!timer) throw new Error(`timer-is-a-floor scene: 알 수 없는 id(${id})`);
      return {
        ...scene,
        now: timer.delayMs,
        queue,
        timers: scene.timers.map((t) => (t.id === id ? { ...t, queued: true } : t)),
        step: { kind: 'due', id },
      };
    }

    if (event.type === 'script:end') {
      const at = typeof p?.at === 'number' ? p.at : undefined;
      if (at === undefined) throw new Error('timer-is-a-floor scene: script:end payload 모양이 다르다');
      return { ...scene, now: at, stackBusy: false, step: { kind: 'scriptEnd', at } };
    }

    if (event.type === 'timer:dequeue') {
      const id = typeof p?.id === 'string' ? p.id : undefined;
      const requestedMs = typeof p?.requestedMs === 'number' ? p.requestedMs : undefined;
      const actualMs = typeof p?.actualMs === 'number' ? p.actualMs : undefined;
      const latenessMs = typeof p?.latenessMs === 'number' ? p.latenessMs : undefined;
      const runUntil = typeof p?.runUntil === 'number' ? p.runUntil : undefined;
      const queue = asStringArray(p?.queue);
      if (
        id === undefined ||
        requestedMs === undefined ||
        actualMs === undefined ||
        latenessMs === undefined ||
        runUntil === undefined ||
        queue === undefined
      ) {
        throw new Error('timer-is-a-floor scene: timer:dequeue payload 모양이 다르다');
      }
      return {
        ...scene,
        now: actualMs,
        stackBusy: true,
        queue,
        timers: scene.timers.map((t) => (t.id === id ? { ...t, actualMs, latenessMs, runUntil } : t)),
        step: { kind: 'dequeue', id, requestedMs, actualMs, latenessMs },
      };
    }

    return scene;
  },
};
