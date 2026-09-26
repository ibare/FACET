/**
 * hold-out-some 의 장면.
 *
 * 바탕 — 점 열(initialData 에서 베낌) · 축 범위(silent init)
 * 자취 — 가름(split) · 맞춘 직선(fit) · 훈련 쪽 잼 · 떼어 둔 쪽 잼
 * 이번 걸음 — step.kind
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowHoldOutSome,
  type AxisRange,
  type LineFit,
  type Point,
  type Residual,
} from './algorithm';

export type Measured = { residuals: Residual[]; mse: number };

export type HoldOutSomeStep =
  | { kind: 'points' }
  | { kind: 'split' }
  | { kind: 'fit' }
  | { kind: 'measure-train' }
  | { kind: 'measure-held' };

export type HoldOutSomeScene = {
  points: Point[];
  range: AxisRange | null;
  split: { train: number[]; held: number[] } | null;
  fit: LineFit | null;
  onTrain: Measured | null;
  onHeld: Measured | null;
  step: HoldOutSomeStep;
};

function fail(path: string, why: string): never {
  throw new Error(`hold-out-some scene: ${path} — ${why}`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload`, '객체가 아니다');
  return p as Record<string, unknown>;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '수가 아니다');
  return v;
}

function indexList(v: unknown, path: string, n: number): number[] {
  if (!Array.isArray(v)) fail(path, '배열이 아니다');
  return v.map((x: unknown, i: number) => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x >= n) fail(`${path}[${i}]`, '점의 자리가 아니다');
    return x;
  });
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

function measured(event: FacetRuntimeEvent, n: number, expect: number[]): Measured {
  const p = payloadOf(event);
  if (!Array.isArray(p.residuals)) fail(`${event.type}.payload.residuals`, '배열이 아니다');
  const residuals: Residual[] = p.residuals.map((r: unknown, i: number) => {
    const path = `${event.type}.payload.residuals[${i}]`;
    if (typeof r !== 'object' || r === null) fail(path, '객체가 아니다');
    const q = r as Record<string, unknown>;
    const index = q.index;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= n) {
      fail(`${path}.index`, '점의 자리가 아니다');
    }
    return { index, residual: num(q.residual, `${path}.residual`) };
  });
  if (!sameSet(residuals.map((r) => r.index), expect)) {
    fail(`${event.type}.payload.residuals`, '잰 점이 가른 쪽의 점과 다르다');
  }
  return { residuals, mse: num(p.mse, `${event.type}.payload.mse`) };
}

export const holdOutSomeScene: ScenePlan<HoldOutSomeScene> = {
  initial(initialData: unknown): HoldOutSomeScene {
    const data = narrowHoldOutSome(initialData);
    return {
      points: data.points.map((p) => ({ x: p.x, y: p.y })),
      range: null,
      split: null,
      fit: null,
      onTrain: null,
      onHeld: null,
      step: { kind: 'points' },
    };
  },

  reduce(scene: HoldOutSomeScene, event: FacetRuntimeEvent): HoldOutSomeScene {
    const n = scene.points.length;
    switch (event.type) {
      case 'init': {
        if (scene.range) fail('init', '축 범위가 이미 있다');
        const p = payloadOf(event);
        if (typeof p.range !== 'object' || p.range === null) fail('init.payload.range', '객체가 아니다');
        const r = p.range as Record<string, unknown>;
        const range: AxisRange = {
          xMin: num(r.xMin, 'init.payload.range.xMin'),
          xMax: num(r.xMax, 'init.payload.range.xMax'),
          yMin: num(r.yMin, 'init.payload.range.yMin'),
          yMax: num(r.yMax, 'init.payload.range.yMax'),
        };
        if (!(range.xMin < range.xMax) || !(range.yMin < range.yMax)) fail('init.payload.range', '범위가 비었다');
        for (const [i, pt] of scene.points.entries()) {
          if (pt.x < range.xMin || pt.x > range.xMax || pt.y < range.yMin || pt.y > range.yMax) {
            fail(`init.payload.range`, `점 ${i} 가 범위 밖이다`);
          }
        }
        return { ...scene, range, step: { kind: 'points' } };
      }
      case 'split': {
        if (!scene.range) fail('split', 'init 보다 먼저 왔다');
        if (scene.split) fail('split', '이미 갈랐다');
        const p = payloadOf(event);
        const train = indexList(p.train, 'split.payload.train', n);
        const held = indexList(p.held, 'split.payload.held', n);
        const all = new Set([...train, ...held]);
        if (all.size !== n || train.length + held.length !== n) fail('split.payload', '두 쪽이 겹치거나 점을 빠뜨렸다');
        return { ...scene, split: { train, held }, step: { kind: 'split' } };
      }
      case 'fit': {
        if (!scene.split) fail('fit', '가르기 전에 왔다');
        if (scene.fit) fail('fit', '이미 맞췄다');
        const p = payloadOf(event);
        const fit: LineFit = {
          a: num(p.a, 'fit.payload.a'),
          b: num(p.b, 'fit.payload.b'),
          meanX: num(p.meanX, 'fit.payload.meanX'),
          meanY: num(p.meanY, 'fit.payload.meanY'),
        };
        return { ...scene, fit, step: { kind: 'fit' } };
      }
      case 'measure-train': {
        if (!scene.split || !scene.fit) fail('measure-train', '맞추기 전에 왔다');
        if (scene.onTrain) fail('measure-train', '이미 쟀다');
        const onTrain = measured(event, n, scene.split.train);
        return { ...scene, onTrain, step: { kind: 'measure-train' } };
      }
      case 'measure-held': {
        if (!scene.split || !scene.fit || !scene.onTrain) fail('measure-held', '훈련 쪽을 재기 전에 왔다');
        if (scene.onHeld) fail('measure-held', '이미 쟀다');
        const onHeld = measured(event, n, scene.split.held);
        return { ...scene, onHeld, step: { kind: 'measure-held' } };
      }
      default:
        fail(event.type, '모르는 이벤트다');
    }
  },
};
