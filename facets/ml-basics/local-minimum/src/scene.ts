/**
 * local-minimum 장면.
 *
 * 바탕(init 이 한 번 정함) — 곡선 표본 · 창의 L 범위 · 격자에서 가장 낮은 자리 · 멈춤 문턱
 * 자취(걸음이 쌓음)     — 지나온 자리들 `path` (마지막이 지금 자리) · 멈췄으면 언덕
 * 이번 걸음             — `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowLocalMinimumData, type Point, type Spot } from './algorithm.js';

export type LocalMinimumBase = {
  samples: Spot[];
  lLo: number;
  lHi: number;
  lowest: Spot;
  stopBelow: number;
};

export type LocalMinimumStep =
  | { kind: 'start' }
  | { kind: 'update'; k: number; from: Point; moved: number; stopped: boolean };

export type LocalMinimumScene = {
  stepMs: number;
  base: LocalMinimumBase | null;
  /** 지나온 자리. [0] 이 처음 자리, 마지막이 지금 자리 */
  path: Point[];
  /** 멈춘 갱신에서 정해진다 — 가장 낮은 곳과 멈춘 자리 사이의 언덕 */
  hill: Spot | null;
  stopped: boolean;
  step: LocalMinimumStep | null;
};

function obj(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`local-minimum 장면: ${where} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function fin(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`local-minimum 장면: ${where}.${key} 가 유한한 수가 아니다`);
  return v;
}

function spot(v: unknown, where: string): Spot {
  const o = obj(v, where);
  return { w: fin(o, 'w', where), l: fin(o, 'l', where) };
}

function point(v: unknown, where: string): Point {
  const o = obj(v, where);
  return { w: fin(o, 'w', where), l: fin(o, 'l', where), g: fin(o, 'g', where), gap: fin(o, 'gap', where) };
}

function reduceInit(scene: LocalMinimumScene, payload: unknown): LocalMinimumScene {
  if (scene.base !== null) throw new Error('local-minimum 장면: init 이 두 번 왔다');
  const p = obj(payload, 'init.payload');
  if (!Array.isArray(p.samples) || p.samples.length < 2) throw new Error('local-minimum 장면: init.payload.samples 가 둘 이상의 배열이 아니다');
  const samples = p.samples.map((s, i) => spot(s, `init.payload.samples[${i}]`));
  for (let i = 1; i < samples.length; i += 1) {
    if (!(samples[i]!.w > samples[i - 1]!.w)) throw new Error(`local-minimum 장면: init.payload.samples[${i}].w 가 오름차순이 아니다`);
  }
  const lLo = fin(p, 'lLo', 'init.payload');
  const lHi = fin(p, 'lHi', 'init.payload');
  if (!(lLo < lHi)) throw new Error('local-minimum 장면: init.payload.lLo 가 lHi 보다 작지 않다');
  const start = point(p.start, 'init.payload.start');
  return {
    ...scene,
    base: {
      samples,
      lLo,
      lHi,
      lowest: spot(p.lowest, 'init.payload.lowest'),
      stopBelow: fin(p, 'stopBelow', 'init.payload'),
    },
    path: [start],
    hill: null,
    stopped: false,
    step: { kind: 'start' },
  };
}

function reduceUpdate(scene: LocalMinimumScene, payload: unknown): LocalMinimumScene {
  if (scene.base === null) throw new Error('local-minimum 장면: init 앞에 update 가 왔다');
  if (scene.stopped) throw new Error('local-minimum 장면: 멈춘 뒤에 update 가 왔다');
  const p = obj(payload, 'update.payload');
  const k = fin(p, 'k', 'update.payload');
  if (k !== scene.path.length) throw new Error(`local-minimum 장면: update.payload.k (${k}) 가 지나온 갱신 수 + 1 (${scene.path.length}) 과 다르다`);
  const from = point(p.from, 'update.payload.from');
  const now = scene.path[scene.path.length - 1]!;
  if (from.w !== now.w) throw new Error(`local-minimum 장면: update.payload.from.w (${from.w}) 가 지금 자리 (${now.w}) 와 다르다`);
  const to = point(p.to, 'update.payload.to');
  const moved = fin(p, 'moved', 'update.payload');
  if (typeof p.stopped !== 'boolean') throw new Error('local-minimum 장면: update.payload.stopped 가 참거짓이 아니다');
  const stopped = p.stopped;
  let hill: Spot | null = null;
  if (stopped) {
    hill = spot(p.hill, 'update.payload.hill');
  } else if (p.hill !== null) {
    throw new Error('local-minimum 장면: 멈추지 않은 update 에 hill 이 실렸다');
  }
  return {
    ...scene,
    path: [...scene.path, to],
    hill,
    stopped,
    step: { kind: 'update', k, from, moved, stopped },
  };
}

export const localMinimumScene: ScenePlan<LocalMinimumScene> = {
  initial(initialData: unknown): LocalMinimumScene {
    const d = narrowLocalMinimumData(initialData);
    // 곡선 · 가장 낮은 자리는 알고리즘의 셈이라 silent init 이 걸음 0 을 채운다
    return { stepMs: d.stepMs, base: null, path: [], hill: null, stopped: false, step: null };
  },
  reduce(scene: LocalMinimumScene, event: FacetRuntimeEvent): LocalMinimumScene {
    switch (event.type) {
      case 'init':
        return reduceInit(scene, event.payload);
      case 'update':
        return reduceUpdate(scene, event.payload);
      default:
        throw new Error(`local-minimum 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
