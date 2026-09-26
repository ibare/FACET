/**
 * knee-of-the-curve 장면.
 *
 * 바탕 — 처리율 μ 와 올릴 도착률 목록 (initialData), 처리 시간 · 세로 축 끝 (silent init)
 * 자취 — 지금까지 올린 도착률 칸마다의 셈 (points)
 * 이번 걸음 — 무엇이 막 일어났는가 (step)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowKneeData } from './algorithm.js';

export type KneeAxis = { serviceMs: number; wMaxMs: number };

export type KneePoint = {
  lambda: number;
  utilization: number;
  spare: number;
  wMs: number;
  waitMs: number;
  deltaMs: number | null;
};

export type KneeStep =
  | { kind: 'idle' }
  | {
      kind: 'load';
      /** 앞 칸의 도착률 (첫 칸이면 0 — 아직 들어오는 것이 없던 자리) */
      fromLambda: number;
      /** 앞 칸의 W (첫 칸이면 null) */
      fromMs: number | null;
      toMs: number;
      ratioToFirst: number;
      last: boolean;
    };

export type KneeScene = {
  mu: number;
  lambdas: number[];
  axis: KneeAxis | null;
  points: KneePoint[];
  step: KneeStep | null;
};

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`knee-of-the-curve 장면: ${type}.payload.${key} 가 수가 아니다`);
  }
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`knee-of-the-curve 장면: ${event.type}.payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

export const kneeOfTheCurveScene: ScenePlan<KneeScene> = {
  initial(initialData: unknown): KneeScene {
    const data = narrowKneeData(initialData);
    return { mu: data.mu, lambdas: [...data.lambdas], axis: null, points: [], step: null };
  },

  reduce(scene: KneeScene, event: FacetRuntimeEvent): KneeScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const serviceMs = num(p, 'serviceMs', 'init');
        const wMaxMs = num(p, 'wMaxMs', 'init');
        if (scene.axis !== null) throw new Error('knee-of-the-curve 장면: init 이 두 번 왔다');
        return { ...scene, axis: { serviceMs, wMaxMs }, points: [], step: { kind: 'idle' } };
      }
      case 'load': {
        if (scene.axis === null) throw new Error('knee-of-the-curve 장면: init 앞에 load 가 왔다');
        const p = payloadOf(event);
        const lambda = num(p, 'lambda', 'load');
        const expected = scene.lambdas[scene.points.length];
        if (expected === undefined) {
          throw new Error(`knee-of-the-curve 장면: load.payload.lambda ${lambda} — 올릴 칸이 더 없다`);
        }
        if (lambda !== expected) {
          throw new Error(`knee-of-the-curve 장면: load.payload.lambda ${lambda} 가 차례의 ${expected} 와 다르다`);
        }
        const wMs = num(p, 'wMs', 'load');
        const rawDelta = p.deltaMs;
        let deltaMs: number | null;
        if (rawDelta === null) deltaMs = null;
        else if (typeof rawDelta === 'number' && Number.isFinite(rawDelta)) deltaMs = rawDelta;
        else throw new Error('knee-of-the-curve 장면: load.payload.deltaMs 가 수도 null 도 아니다');
        const before = scene.points[scene.points.length - 1];
        if (before === undefined) {
          if (deltaMs !== null) throw new Error('knee-of-the-curve 장면: 첫 칸의 load.payload.deltaMs 가 null 이 아니다');
        } else {
          if (deltaMs === null) throw new Error('knee-of-the-curve 장면: load.payload.deltaMs 가 null 이다');
          if (Math.abs(before.wMs + deltaMs - wMs) > 1e-9) {
            throw new Error('knee-of-the-curve 장면: load.payload.deltaMs 가 앞 칸 W 와 맞지 않다');
          }
        }
        const last = p.last;
        if (typeof last !== 'boolean') throw new Error('knee-of-the-curve 장면: load.payload.last 가 참거짓이 아니다');
        const point: KneePoint = {
          lambda,
          utilization: num(p, 'utilization', 'load'),
          spare: num(p, 'spare', 'load'),
          wMs,
          waitMs: num(p, 'waitMs', 'load'),
          deltaMs,
        };
        return {
          ...scene,
          points: [...scene.points, point],
          step: {
            kind: 'load',
            fromLambda: before === undefined ? 0 : before.lambda,
            fromMs: before === undefined ? null : before.wMs,
            toMs: wMs,
            ratioToFirst: num(p, 'ratioToFirst', 'load'),
            last,
          },
        };
      }
      default:
        throw new Error(`knee-of-the-curve 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
