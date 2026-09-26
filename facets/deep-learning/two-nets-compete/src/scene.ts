import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowTwoNetsCompeteData } from './algorithm';

/** 한 걸음이 끝난 뒤의 두 쪽과 점수. 알고리즘이 셈한 값을 그대로 옮긴다. */
export type TwoNetsCompeteSnap = {
  kind: 'start' | 'discriminate' | 'generate';
  round: number;
  w: number;
  c: number;
  b: number;
  fakes: number[];
  meanReal: number;
  meanFake: number;
  v: number;
  gap: number;
  /** 앞 걸음에서 V 가 달라진 양. 걸음 0 은 0 이 아니라 null */
  dv: number | null;
};

/** init 이 한 번 정하는 틀 */
export type TwoNetsCompeteFrame = {
  realCenter: number;
  rounds: number;
  vLow: number;
  vHigh: number;
  xLow: number;
  xHigh: number;
};

export type TwoNetsCompeteStep =
  | { kind: 'start' }
  | { kind: 'discriminate'; round: number; fromW: number; fromC: number }
  | { kind: 'generate'; round: number; fromB: number; moved: number; final: boolean; fakeCenter: number };

export type TwoNetsCompeteScene = {
  /** 바탕 — 진짜 표본 */
  real: number[];
  /** 바탕 — init 이 정한다. init 전에는 null */
  frame: TwoNetsCompeteFrame | null;
  /** 자취 — 걸음마다 하나씩 쌓인다 */
  trail: TwoNetsCompeteSnap[];
  /** 이번 걸음 */
  step: TwoNetsCompeteStep | null;
};

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('two-nets-compete 장면: payload 가 객체가 아니다');
  }
  return (payload as Record<string, unknown>)[key];
}

function num(payload: unknown, key: string): number {
  const v = field(payload, key);
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`two-nets-compete 장면: payload.${key} 가 수가 아니다`);
  }
  return v;
}

function nums(payload: unknown, key: string): number[] {
  const v = field(payload, key);
  if (!Array.isArray(v)) throw new Error(`two-nets-compete 장면: payload.${key} 가 배열이 아니다`);
  return v.map((item) => {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      throw new Error(`two-nets-compete 장면: payload.${key} 에 수가 아닌 것이 있다`);
    }
    return item;
  });
}

function flag(payload: unknown, key: string): boolean {
  const v = field(payload, key);
  if (typeof v !== 'boolean') throw new Error(`two-nets-compete 장면: payload.${key} 가 참거짓이 아니다`);
  return v;
}

function last(scene: TwoNetsCompeteScene): TwoNetsCompeteSnap {
  const snap = scene.trail[scene.trail.length - 1];
  if (snap === undefined) throw new Error('two-nets-compete 장면: init 전에 갱신이 왔다');
  return snap;
}

export const twoNetsCompeteScene: ScenePlan<TwoNetsCompeteScene> = {
  initial(initialData: unknown): TwoNetsCompeteScene {
    const data = narrowTwoNetsCompeteData(initialData);
    return { real: [...data.real], frame: null, trail: [], step: null };
  },

  reduce(scene: TwoNetsCompeteScene, event: FacetRuntimeEvent): TwoNetsCompeteScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        const snap: TwoNetsCompeteSnap = {
          kind: 'start',
          round: 0,
          w: num(p, 'w'),
          c: num(p, 'c'),
          b: num(p, 'b'),
          fakes: nums(p, 'fakes'),
          meanReal: num(p, 'meanReal'),
          meanFake: num(p, 'meanFake'),
          v: num(p, 'v'),
          gap: num(p, 'gap'),
          dv: null,
        };
        return {
          real: [...scene.real],
          frame: {
            realCenter: num(p, 'realCenter'),
            rounds: num(p, 'rounds'),
            vLow: num(p, 'vLow'),
            vHigh: num(p, 'vHigh'),
            xLow: num(p, 'xLow'),
            xHigh: num(p, 'xHigh'),
          },
          trail: [snap],
          step: { kind: 'start' },
        };
      }
      case 'discriminate': {
        const before = last(scene);
        const round = num(p, 'round');
        const snap: TwoNetsCompeteSnap = {
          kind: 'discriminate',
          round,
          w: num(p, 'w'),
          c: num(p, 'c'),
          b: before.b,
          fakes: [...before.fakes],
          meanReal: num(p, 'meanReal'),
          meanFake: num(p, 'meanFake'),
          v: num(p, 'v'),
          gap: num(p, 'gap'),
          dv: num(p, 'dv'),
        };
        return {
          real: [...scene.real],
          frame: scene.frame,
          trail: [...scene.trail, snap],
          step: { kind: 'discriminate', round, fromW: before.w, fromC: before.c },
        };
      }
      case 'generate': {
        const before = last(scene);
        const round = num(p, 'round');
        const snap: TwoNetsCompeteSnap = {
          kind: 'generate',
          round,
          w: before.w,
          c: before.c,
          b: num(p, 'b'),
          fakes: nums(p, 'fakes'),
          meanReal: num(p, 'meanReal'),
          meanFake: num(p, 'meanFake'),
          v: num(p, 'v'),
          gap: num(p, 'gap'),
          dv: num(p, 'dv'),
        };
        return {
          real: [...scene.real],
          frame: scene.frame,
          trail: [...scene.trail, snap],
          step: {
            kind: 'generate',
            round,
            fromB: before.b,
            moved: num(p, 'moved'),
            final: flag(p, 'final'),
            fakeCenter: num(p, 'fakeCenter'),
          },
        };
      }
      default:
        throw new Error(`two-nets-compete 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
