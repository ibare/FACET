/**
 * noisy-path 장면.
 *
 * - 바탕: 점 · 처음 자리 · 뽑힌 차례 (initialData 에서) + 그릇의 바닥 · 고리 · 범위 (silent init 에서)
 * - 자취: 지나온 갱신들
 * - 이번 걸음: 처음 모습이거나, 갱신 k
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowNoisyPathData,
  type NoisyPathBase,
  type NoisyPathContour,
  type NoisyPathUpdate,
  type WB,
} from './algorithm.js';

export type NoisyPathStep = { kind: 'start' } | { kind: 'update'; k: number };

export type NoisyPathScene = {
  xs: number[];
  ys: number[];
  start: WB;
  eta: number;
  order: number[];
  /** silent init 이 오기 전에는 없다 */
  base: NoisyPathBase | null;
  updates: NoisyPathUpdate[];
  step: NoisyPathStep;
};

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`noisy-path 장면: ${path} 가 유한한 수가 아니다`);
  return v;
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`noisy-path 장면: ${path} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function wb(v: unknown, path: string): WB {
  const o = obj(v, path);
  return { w: num(o.w, `${path}.w`), b: num(o.b, `${path}.b`) };
}

function readBase(raw: unknown): NoisyPathBase {
  const o = obj(raw, 'init.payload');
  const plane = obj(o.plane, 'init.payload.plane');
  const data = obj(o.data, 'init.payload.data');
  if (!Array.isArray(o.contours) || o.contours.length === 0) {
    throw new Error('noisy-path 장면: init.payload.contours 가 비었거나 배열이 아니다');
  }
  const contours: NoisyPathContour[] = o.contours.map((c, i) => {
    const r = obj(c, `init.payload.contours[${i}]`);
    return {
      level: num(r.level, `contours[${i}].level`),
      rx: num(r.rx, `contours[${i}].rx`),
      ry: num(r.ry, `contours[${i}].ry`),
      rot: num(r.rot, `contours[${i}].rot`),
    };
  });
  return {
    lossStart: num(o.lossStart, 'init.payload.lossStart'),
    center: wb(o.center, 'init.payload.center'),
    lossMin: num(o.lossMin, 'init.payload.lossMin'),
    contours,
    plane: {
      wMin: num(plane.wMin, 'plane.wMin'),
      wMax: num(plane.wMax, 'plane.wMax'),
      bMin: num(plane.bMin, 'plane.bMin'),
      bMax: num(plane.bMax, 'plane.bMax'),
    },
    data: {
      xMin: num(data.xMin, 'data.xMin'),
      xMax: num(data.xMax, 'data.xMax'),
      yMin: num(data.yMin, 'data.yMin'),
      yMax: num(data.yMax, 'data.yMax'),
    },
  };
}

function readUpdate(raw: unknown): NoisyPathUpdate {
  const o = obj(raw, 'update.payload');
  return {
    k: num(o.k, 'update.payload.k'),
    point: num(o.point, 'update.payload.point'),
    gPoint: wb(o.gPoint, 'update.payload.gPoint'),
    gFull: wb(o.gFull, 'update.payload.gFull'),
    angle: num(o.angle, 'update.payload.angle'),
    from: wb(o.from, 'update.payload.from'),
    to: wb(o.to, 'update.payload.to'),
    lossBefore: num(o.lossBefore, 'update.payload.lossBefore'),
    lossAfter: num(o.lossAfter, 'update.payload.lossAfter'),
  };
}

/** 지금 (w, b) — 마지막 갱신 뒤 자리, 없으면 처음 자리 */
export function currentWB(scene: NoisyPathScene): WB {
  const last = scene.updates[scene.updates.length - 1];
  return last ? last.to : scene.start;
}

export const noisyPathScene: ScenePlan<NoisyPathScene> = {
  initial(initialData: unknown): NoisyPathScene {
    const d = narrowNoisyPathData(initialData);
    return {
      xs: [...d.xs],
      ys: [...d.ys],
      start: { w: d.start.w, b: d.start.b },
      eta: d.eta,
      order: [...d.order],
      base: null,
      updates: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: NoisyPathScene, event: FacetRuntimeEvent): NoisyPathScene {
    switch (event.type) {
      case 'init': {
        if (scene.base !== null) throw new Error('noisy-path 장면: init 이 두 번 왔다');
        return { ...scene, base: readBase(event.payload), step: { kind: 'start' } };
      }
      case 'update': {
        if (scene.base === null) throw new Error('noisy-path 장면: init 보다 update 가 먼저 왔다');
        const u = readUpdate(event.payload);
        const k = scene.updates.length + 1;
        if (u.k !== k) throw new Error(`noisy-path 장면: update.payload.k 가 ${k} 가 아니다 (${u.k})`);
        const expected = scene.order[k - 1];
        if (expected === undefined) throw new Error(`noisy-path 장면: 갱신 ${k} 는 뽑힌 차례 밖이다`);
        if (u.point !== expected) {
          throw new Error(`noisy-path 장면: update.payload.point 가 뽑힌 차례의 ${expected} 가 아니다 (${u.point})`);
        }
        const now = currentWB(scene);
        if (u.from.w !== now.w || u.from.b !== now.b) {
          throw new Error('noisy-path 장면: update.payload.from 이 지금 (w, b) 와 다르다');
        }
        return { ...scene, updates: [...scene.updates, u], step: { kind: 'update', k } };
      }
      default:
        throw new Error(`noisy-path 장면: 모르는 이벤트 '${event.type}'`);
    }
  },
};
