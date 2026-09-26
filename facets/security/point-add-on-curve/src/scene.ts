/**
 * point-add-on-curve 장면.
 *
 * 바탕 — 곡선 계수 · 두 점 · 곡선의 실근 · 그릴 범위 (silent init 이 한 번 정한다)
 * 자취 — 잇는 선 · 셋째 점 · P + Q (걸음이 하나씩 쌓는다)
 * 이번 걸음 — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowPointAddData } from './algorithm.js';

export type ScenePoint = { x: number; y: number };
export type NamedPoint = { name: string; x: number; y: number };

export type PointAddBase = {
  a: number;
  b: number;
  p: NamedPoint;
  q: NamedPoint;
  roots: number[];
  frame: { xMin: number; xMax: number; yAbs: number };
};

export type PointAddLine = { lambda: number; intercept: number };
export type PointAddSum = { from: ScenePoint; to: ScenePoint; lhs: number; rhs: number };

export type PointAddStep = 'start' | 'connect' | 'meet' | 'flip';

export type PointAddScene = {
  base: PointAddBase | null;
  line: PointAddLine | null;
  third: ScenePoint | null;
  sum: PointAddSum | null;
  step: PointAddStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function rec(v: unknown, path: string): Record<string, unknown> {
  if (!isRecord(v)) throw new Error(`point-add-on-curve 장면: ${path} 가 객체가 아니다`);
  return v;
}

function num(o: Record<string, unknown>, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`point-add-on-curve 장면: ${path}.${key} 가 수가 아니다`);
  }
  return v;
}

function pt(o: Record<string, unknown>, key: string, path: string): ScenePoint {
  const r = rec(o[key], `${path}.${key}`);
  return { x: num(r, 'x', `${path}.${key}`), y: num(r, 'y', `${path}.${key}`) };
}

function named(o: Record<string, unknown>, key: string, path: string): NamedPoint {
  const r = rec(o[key], `${path}.${key}`);
  const name = r['name'];
  if (typeof name !== 'string') throw new Error(`point-add-on-curve 장면: ${path}.${key}.name 이 글자가 아니다`);
  return { name, x: num(r, 'x', `${path}.${key}`), y: num(r, 'y', `${path}.${key}`) };
}

function samePoint(a: ScenePoint, b: ScenePoint): boolean {
  return a.x === b.x && a.y === b.y;
}

export const pointAddOnCurveScene: ScenePlan<PointAddScene> = {
  initial(initialData: unknown): PointAddScene {
    // 모양만 확인한다 — 근과 범위는 알고리즘이 셈해 silent init 으로 보낸다.
    narrowPointAddData(initialData);
    return { base: null, line: null, third: null, sum: null, step: 'start' };
  },

  reduce(scene: PointAddScene, event: FacetRuntimeEvent): PointAddScene {
    switch (event.type) {
      case 'init': {
        const pl = rec(event.payload, 'init.payload');
        const rootsRaw = pl['roots'];
        if (!Array.isArray(rootsRaw) || rootsRaw.length === 0) {
          throw new Error('point-add-on-curve 장면: init.payload.roots 가 빈 배열이거나 배열이 아니다');
        }
        const roots = rootsRaw.map((r, i) => {
          if (typeof r !== 'number' || !Number.isFinite(r)) {
            throw new Error(`point-add-on-curve 장면: init.payload.roots[${i}] 가 수가 아니다`);
          }
          return r;
        });
        const fr = rec(pl['frame'], 'init.payload.frame');
        return {
          base: {
            a: num(pl, 'a', 'init.payload'),
            b: num(pl, 'b', 'init.payload'),
            p: named(pl, 'p', 'init.payload'),
            q: named(pl, 'q', 'init.payload'),
            roots,
            frame: {
              xMin: num(fr, 'xMin', 'init.payload.frame'),
              xMax: num(fr, 'xMax', 'init.payload.frame'),
              yAbs: num(fr, 'yAbs', 'init.payload.frame'),
            },
          },
          line: null,
          third: null,
          sum: null,
          step: 'start',
        };
      }
      case 'connect': {
        if (scene.base === null) throw new Error('point-add-on-curve 장면: connect 가 init 보다 먼저 왔다');
        if (scene.line !== null) throw new Error('point-add-on-curve 장면: connect 가 두 번 왔다');
        const pl = rec(event.payload, 'connect.payload');
        return {
          ...scene,
          line: { lambda: num(pl, 'lambda', 'connect.payload'), intercept: num(pl, 'intercept', 'connect.payload') },
          step: 'connect',
        };
      }
      case 'meet': {
        if (scene.line === null) throw new Error('point-add-on-curve 장면: meet 앞에 잇는 선이 없다');
        if (scene.third !== null) throw new Error('point-add-on-curve 장면: meet 가 두 번 왔다');
        const pl = rec(event.payload, 'meet.payload');
        return {
          ...scene,
          third: { x: num(pl, 'x', 'meet.payload'), y: num(pl, 'y', 'meet.payload') },
          step: 'meet',
        };
      }
      case 'flip': {
        if (scene.third === null) throw new Error('point-add-on-curve 장면: flip 앞에 셋째 점이 없다');
        if (scene.sum !== null) throw new Error('point-add-on-curve 장면: flip 이 두 번 왔다');
        const pl = rec(event.payload, 'flip.payload');
        const from = pt(pl, 'from', 'flip.payload');
        if (!samePoint(from, scene.third)) {
          throw new Error('point-add-on-curve 장면: flip.payload.from 이 셋째 점과 다르다');
        }
        return {
          ...scene,
          sum: {
            from,
            to: pt(pl, 'to', 'flip.payload'),
            lhs: num(pl, 'lhs', 'flip.payload'),
            rhs: num(pl, 'rhs', 'flip.payload'),
          },
          step: 'flip',
        };
      }
      default:
        throw new Error(`point-add-on-curve 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
