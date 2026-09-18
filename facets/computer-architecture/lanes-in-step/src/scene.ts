/**
 * 차선을 나란히 — 장면.
 *
 * 바탕: a · b · width (init 이 한 번 정한다)
 * 자취: 두 쪽의 c 칸과 두 쪽이 낸 명령 수
 * 이번 걸음: step — 이번 박자에 스칼라가 민 원소 하나, SIMD 가 민 차선 묶음
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type LanesInStepStep =
  | { kind: 'init' }
  | {
      kind: 'beat';
      beat: number;
      /** 스칼라가 이번 박자에 더한 원소 자리 */
      scalar: number | null;
      /** SIMD 가 이번 박자에 더한 차선들 — [start, start + count) */
      simd: { start: number; count: number } | null;
    }
  | { kind: 'done'; scalar: number; simd: number };

export type LanesInStepScene = {
  a: number[];
  b: number[];
  width: number;
  /** 스칼라 쪽 c. 아직 안 더한 칸은 null */
  scalarC: (number | null)[];
  /** SIMD 쪽 c */
  simdC: (number | null)[];
  /** 두 쪽이 지금까지 낸 명령 수 */
  scalarIssued: number;
  simdIssued: number;
  step: LanesInStepStep | null;
};

function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function empty(): LanesInStepScene {
  return {
    a: [],
    b: [],
    width: 1,
    scalarC: [],
    simdC: [],
    scalarIssued: 0,
    simdIssued: 0,
    step: null,
  };
}

export const lanesInStepScene: ScenePlan<LanesInStepScene> = {
  initial(): LanesInStepScene {
    return empty();
  },

  reduce(scene: LanesInStepScene, event: FacetRuntimeEvent): LanesInStepScene {
    if (event.type === 'init') {
      const p = event.payload as { a?: unknown; b?: unknown; width?: unknown } | undefined;
      const a = nums(p?.a);
      const b = nums(p?.b);
      const n = Math.min(a.length, b.length);
      return {
        a: a.slice(0, n),
        b: b.slice(0, n),
        width: Math.max(1, num(p?.width, 1)),
        scalarC: new Array<number | null>(n).fill(null),
        simdC: new Array<number | null>(n).fill(null),
        scalarIssued: 0,
        simdIssued: 0,
        step: { kind: 'init' },
      };
    }

    if (event.type === 'beat') {
      const p = event.payload as
        | {
            beat?: unknown;
            scalar?: { index?: unknown; sum?: unknown } | null;
            simd?: { start?: unknown; sums?: unknown } | null;
          }
        | undefined;
      const scalarC = scene.scalarC.slice();
      const simdC = scene.simdC.slice();
      let scalarIssued = scene.scalarIssued;
      let simdIssued = scene.simdIssued;
      let scalarAt: number | null = null;
      let simdAt: { start: number; count: number } | null = null;
      if (p?.scalar && typeof p.scalar.index === 'number' && typeof p.scalar.sum === 'number') {
        scalarAt = p.scalar.index;
        scalarC[scalarAt] = p.scalar.sum;
        scalarIssued += 1;
      }
      if (p?.simd && typeof p.simd.start === 'number') {
        const start = p.simd.start;
        const sums = nums(p.simd.sums);
        sums.forEach((sum, k) => {
          simdC[start + k] = sum;
        });
        simdAt = { start, count: sums.length };
        simdIssued += 1;
      }
      return {
        ...scene,
        scalarC,
        simdC,
        scalarIssued,
        simdIssued,
        step: {
          kind: 'beat',
          beat: num(p?.beat, 0),
          scalar: scalarAt,
          simd: simdAt,
        },
      };
    }

    if (event.type === 'done') {
      const p = event.payload as { scalar?: unknown; simd?: unknown } | undefined;
      return {
        ...scene,
        step: { kind: 'done', scalar: num(p?.scalar, scene.scalarIssued), simd: num(p?.simd, scene.simdIssued) },
      };
    }

    return scene;
  },
};
