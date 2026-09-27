/**
 * inverse-undoes 장면.
 *
 * 바탕 — 행렬 A 와 점 셋의 처음 자리(`homes`). initialData 에서 베낀다.
 * 자취 — 점의 지금 자리(`pos`) · 떠난 수 · 셈한 역행렬 · 돌아온 수 · A⁻¹A.
 * 이번 걸음 — `step`. 움직이는 걸음은 출발 자리(`from`)를 싣는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowInverseUndoesData,
  narrowMatrix,
  narrowPoints,
  samePt,
  type M,
  type Pt,
} from './algorithm.js';

export type InverseUndoesStep =
  | { kind: 'start' }
  | { kind: 'leave'; from: Pt[] }
  | { kind: 'invert' }
  | { kind: 'return'; from: Pt[] }
  | { kind: 'compose' };

export type InverseUndoesScene = {
  matrix: M;
  homes: Pt[];
  pos: Pt[];
  away: number | null;
  inverse: { det: number; adj: M; inv: M } | null;
  back: { homeFlags: boolean[]; home: number; residual: number } | null;
  product: { m: M; moved: number } | null;
  step: InverseUndoesStep;
};

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`inverse-undoes 장면: ${event.type} 의 payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

function count(v: unknown, path: string, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) {
    throw new Error(`inverse-undoes 장면: ${path} 는 0..${max} 의 정수여야 한다`);
  }
  return v;
}

function sameAll(a: readonly Pt[], b: readonly Pt[]): boolean {
  return a.length === b.length && a.every((p, i) => samePt(p, b[i]!));
}

export const inverseUndoesScene: ScenePlan<InverseUndoesScene> = {
  initial(initialData: unknown): InverseUndoesScene {
    const d = narrowInverseUndoesData(initialData);
    const homes = d.points.map((p): Pt => [p[0], p[1]]);
    return {
      matrix: [d.matrix[0], d.matrix[1], d.matrix[2], d.matrix[3]],
      homes,
      pos: homes.map((p): Pt => [p[0], p[1]]),
      away: null,
      inverse: null,
      back: null,
      product: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: InverseUndoesScene, event: FacetRuntimeEvent): InverseUndoesScene {
    const n = scene.homes.length;
    switch (event.type) {
      case 'leave': {
        const p = payloadOf(event);
        const from = narrowPoints(p.from, 'leave.payload.from');
        const to = narrowPoints(p.to, 'leave.payload.to');
        if (!sameAll(from, scene.pos)) {
          throw new Error('inverse-undoes 장면: leave.payload.from 이 지금 자리와 다르다');
        }
        if (to.length !== n) throw new Error('inverse-undoes 장면: leave.payload.to 의 점 수가 다르다');
        return {
          ...scene,
          pos: to,
          away: count(p.away, 'leave.payload.away', n),
          step: { kind: 'leave', from },
        };
      }
      case 'invert': {
        const p = payloadOf(event);
        if (typeof p.det !== 'number' || !Number.isFinite(p.det) || p.det === 0) {
          throw new Error('inverse-undoes 장면: invert.payload.det 는 0 이 아닌 수여야 한다');
        }
        return {
          ...scene,
          inverse: {
            det: p.det,
            adj: narrowMatrix(p.adj, 'invert.payload.adj'),
            inv: narrowMatrix(p.inv, 'invert.payload.inv'),
          },
          step: { kind: 'invert' },
        };
      }
      case 'return': {
        if (scene.inverse === null) {
          throw new Error('inverse-undoes 장면: 역행렬을 셈하기 전에 return 이 왔다');
        }
        const p = payloadOf(event);
        const from = narrowPoints(p.from, 'return.payload.from');
        const to = narrowPoints(p.to, 'return.payload.to');
        if (!sameAll(from, scene.pos)) {
          throw new Error('inverse-undoes 장면: return.payload.from 이 지금 자리와 다르다');
        }
        if (to.length !== n) throw new Error('inverse-undoes 장면: return.payload.to 의 점 수가 다르다');
        if (typeof p.residual !== 'number' || !Number.isFinite(p.residual) || p.residual < 0) {
          throw new Error('inverse-undoes 장면: return.payload.residual 은 0 이상의 수여야 한다');
        }
        const flags = p.homeFlags;
        if (!Array.isArray(flags) || flags.length !== n || !flags.every((f) => typeof f === 'boolean')) {
          throw new Error(`inverse-undoes 장면: return.payload.homeFlags 는 참거짓 ${n} 개의 배열이어야 한다`);
        }
        const homeFlags = flags.map((f) => f === true);
        const home = count(p.home, 'return.payload.home', n);
        if (homeFlags.filter((f) => f).length !== home) {
          throw new Error('inverse-undoes 장면: return.payload.homeFlags 의 참의 수가 home 과 다르다');
        }
        return {
          ...scene,
          pos: to,
          back: { homeFlags, home, residual: p.residual },
          step: { kind: 'return', from },
        };
      }
      case 'compose': {
        if (scene.inverse === null) {
          throw new Error('inverse-undoes 장면: 역행렬을 셈하기 전에 compose 가 왔다');
        }
        const p = payloadOf(event);
        return {
          ...scene,
          product: {
            m: narrowMatrix(p.product, 'compose.payload.product'),
            moved: count(p.moved, 'compose.payload.moved', n),
          },
          step: { kind: 'compose' },
        };
      }
      default:
        throw new Error(`inverse-undoes 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
