/**
 * 처리량과 지연 — 장면.
 *
 * 바탕  명령어 · 단계 · 두 기계가 명령어마다 IF 에 드는 사이클 (init 없이 initial 이 정한다)
 * 자취  시계 (`cycle`) — 명령어의 자리는 전부 여기서 파생된다
 * 걸음  `step` — 이번에 시계가 어디서 어디까지 흘렀나, 그리고 캡션의 종류와 인자
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { entryCycles, exitCycle } from './algorithm.js';
import type { Machine } from './algorithm.js';

export type Say =
  | { kind: 'ready'; n: number }
  | { kind: 'inside'; c: number; p: number; s: number }
  | { kind: 'bothOut'; i: number; c: number; lat: number }
  | { kind: 'pipeOut'; i: number; from: number; c: number; lat: number }
  | { kind: 'serialOut'; i: number; from: number; c: number; lat: number }
  | { kind: 'pipeDone'; c: number; k: number }
  | { kind: 'serialDone'; c: number; d: number };

export type ThroughputScene = {
  instructions: string[];
  stages: string[];
  entry: Record<Machine, number[]>;
  cycle: number;
  step: { from: number; to: number } | null;
  say: Say;
};

function narrow(raw: unknown): { instructions: string[]; stages: string[] } {
  const d = (raw ?? {}) as { instructions?: unknown; stages?: unknown };
  const strs = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return { instructions: strs(d.instructions), stages: strs(d.stages) };
}

/** 이 사이클에 WB 를 마치는 명령어. 없으면 -1. */
function outAt(entry: number[], depth: number, c: number): number {
  return entry.findIndex((e) => exitCycle(e, depth) === c);
}

function doneBy(entry: number[], depth: number, c: number): number {
  return entry.filter((e) => exitCycle(e, depth) <= c).length;
}

function insideAt(entry: number[], depth: number, c: number): number {
  return entry.filter((e) => e <= c && c <= exitCycle(e, depth)).length;
}

function sayAt(entry: Record<Machine, number[]>, depth: number, c: number): Say {
  const n = entry.pipe.length;
  if (c <= 0) return { kind: 'ready', n };
  const p = outAt(entry.pipe, depth, c);
  const s = outAt(entry.serial, depth, c);
  const pipeLast = Math.max(...entry.pipe.map((e) => exitCycle(e, depth)));
  if (p >= 0 && p === s) return { kind: 'bothOut', i: p, c, lat: depth };
  if (p >= 0 && c === pipeLast) return { kind: 'pipeDone', c, k: doneBy(entry.serial, depth, c) };
  if (s >= 0 && doneBy(entry.serial, depth, c) === n) return { kind: 'serialDone', c, d: c - pipeLast };
  if (p >= 0) return { kind: 'pipeOut', i: p, from: entry.pipe[p], c, lat: c - entry.pipe[p] + 1 };
  if (s >= 0) return { kind: 'serialOut', i: s, from: entry.serial[s], c, lat: c - entry.serial[s] + 1 };
  return { kind: 'inside', c, p: insideAt(entry.pipe, depth, c), s: insideAt(entry.serial, depth, c) };
}

export const throughputNotLatencyScene: ScenePlan<ThroughputScene> = {
  initial(initialData: unknown): ThroughputScene {
    const { instructions, stages } = narrow(initialData);
    const depth = stages.length;
    const entry: Record<Machine, number[]> = {
      serial: entryCycles(instructions.length, depth, 'serial'),
      pipe: entryCycles(instructions.length, depth, 'pipe'),
    };
    return {
      instructions: [...instructions],
      stages: [...stages],
      entry,
      cycle: 0,
      step: null,
      say: sayAt(entry, depth, 0),
    };
  },
  reduce(scene: ThroughputScene, event: FacetRuntimeEvent): ThroughputScene {
    if (event.type !== 'tick') return scene;
    const cycle = (event.payload as { cycle?: unknown } | undefined)?.cycle;
    if (typeof cycle !== 'number') return scene;
    return {
      ...scene,
      cycle,
      step: { from: scene.cycle, to: cycle },
      say: sayAt(scene.entry, scene.stages.length, cycle),
    };
  },
};
