/**
 * starvationOfLong 의 장면 — 이벤트를 잇기만 한다. 누가 오를지는 다시 셈하지 않는다.
 *
 * 바탕: procs (init 이 한 번 정한다)
 * 자취: line · cpu · done · skips · waits
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type StarvationSceneProc = { id: string; arrival: number; burst: number };

export type StarvationStep =
  | { kind: 'empty' }
  | { kind: 'start'; tick: number }
  | {
      kind: 'pick';
      tick: number;
      picked: string;
      /** 고른 것이 뛰어넘은 것 — 고르기 직전 줄에서 그것보다 앞에 섰던 것들 */
      over: string[];
      passed: string[];
      arrived: string[];
      finished: string | null;
    }
  | { kind: 'finish'; tick: number; id: string; wait: number; turnaround: number };

export type StarvationScene = {
  procs: StarvationSceneProc[];
  tick: number;
  line: string[];
  cpu: string | null;
  done: string[];
  skips: Record<string, number>;
  waits: Record<string, number>;
  step: StarvationStep;
};

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readProcList(v: unknown): StarvationSceneProc[] {
  if (!Array.isArray(v)) return [];
  const out: StarvationSceneProc[] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const id = rec.id;
    const arrival = num(rec.arrival);
    const burst = num(rec.burst);
    if (typeof id !== 'string' || arrival === null || burst === null) continue;
    out.push({ id, arrival, burst });
  }
  return out;
}

export const starvationOfLongScene: ScenePlan<StarvationScene> = {
  initial(): StarvationScene {
    return {
      procs: [],
      tick: 0,
      line: [],
      cpu: null,
      done: [],
      skips: {},
      waits: {},
      step: { kind: 'empty' },
    };
  },

  reduce(scene: StarvationScene, event: FacetRuntimeEvent): StarvationScene {
    const p = event.payload;
    if (typeof p !== 'object' || p === null) return scene;
    const rec = p as Record<string, unknown>;
    const tick = num(rec.tick);
    if (tick === null) return scene;

    if (event.type === 'init') {
      const procs = readProcList(rec.procs);
      const line = strList(rec.queue);
      const waits: Record<string, number> = {};
      for (const id of line) waits[id] = 0;
      return {
        procs,
        tick,
        line,
        cpu: null,
        done: [],
        skips: {},
        waits,
        step: { kind: 'start', tick },
      };
    }

    if (event.type === 'pick') {
      const picked = rec.picked;
      if (typeof picked !== 'string') return scene;
      const finishedRaw = rec.finished;
      const finished = typeof finishedRaw === 'string' ? finishedRaw : null;
      const arrived = strList(rec.arrived);
      const passed = strList(rec.passed);
      const before = [...scene.line, ...arrived];
      const at = before.indexOf(picked);
      const over = at > 0 ? before.slice(0, at) : [];
      const skips = { ...scene.skips };
      for (const id of passed) skips[id] = (skips[id] ?? 0) + 1;
      const waits = { ...scene.waits };
      const w = rec.waits;
      if (typeof w === 'object' && w !== null) {
        for (const [id, v] of Object.entries(w as Record<string, unknown>)) {
          if (typeof v === 'number') waits[id] = v;
        }
      }
      const done = finished !== null ? [...scene.done, finished] : [...scene.done];
      return {
        procs: scene.procs,
        tick,
        line: passed,
        cpu: picked,
        done,
        skips,
        waits,
        step: { kind: 'pick', tick, picked, over, passed, arrived, finished },
      };
    }

    if (event.type === 'finish') {
      const id = rec.id;
      const wait = num(rec.wait);
      const turnaround = num(rec.turnaround);
      if (typeof id !== 'string' || wait === null || turnaround === null) return scene;
      return {
        procs: scene.procs,
        tick,
        line: [...scene.line],
        cpu: scene.cpu === id ? null : scene.cpu,
        done: [...scene.done, id],
        skips: { ...scene.skips },
        waits: { ...scene.waits, [id]: wait },
        step: { kind: 'finish', tick, id, wait, turnaround },
      };
    }

    return scene;
  },
};
