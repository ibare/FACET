/**
 * chain-rule-multiply 의 장면.
 *
 * 바탕(base) — init 이 한 번 정한다: 기호 · 두 함수 · 출발 세 값 · 축척용 가장 큰 움직임.
 * 자취 — 걸음이 쌓는다: 세 자리의 움직임(move) · 통째 배(whole) · 민 폭 → 0 의 값(limit).
 * 이번 걸음(step) — 무엇을 흐르게 할지 고르는 데만 쓴다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowChainRuleMultiplyData, type Term } from './algorithm.js';

export type ChainBase = {
  symbols: [string, string, string];
  inner: Term[];
  outer: Term[];
  x0: number;
  u0: number;
  y0: number;
  span: number;
};

/** 한 자리의 움직임. ratio 는 앞 자리 움직임에 견준 배 (입력 자리는 없다). */
export type ChainMove = { to: number; delta: number; ratio: number | null };

export type ChainStep = 'start' | 'push' | 'inner' | 'outer' | 'whole' | 'limit';

export type ChainRuleMultiplyScene = {
  base: ChainBase | null;
  /** 세 자리 — 입력 · 가운데 · 출력 */
  moves: [ChainMove | null, ChainMove | null, ChainMove | null];
  whole: { ratio: number; r1: number; r2: number } | null;
  limit: { d1: number; d2: number; d: number } | null;
  step: ChainStep;
};

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${type}.payload.${key}: 수가 아니다`);
  return v;
}

function obj(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`${event.type}.payload: 객체가 아니다`);
  return p as Record<string, unknown>;
}

function terms(v: unknown, path: string): Term[] {
  if (!Array.isArray(v)) throw new Error(`${path}: 배열이 아니다`);
  return v.map((t, i) => {
    if (!Array.isArray(t) || t.length !== 2 || typeof t[0] !== 'number' || typeof t[1] !== 'number') {
      throw new Error(`${path}[${i}]: [계수, 지수] 가 아니다`);
    }
    return [t[0], t[1]] as Term;
  });
}

function needBase(scene: ChainRuleMultiplyScene, type: string): ChainBase {
  if (!scene.base) throw new Error(`${type}: init 앞에 왔다`);
  return scene.base;
}

export const chainRuleMultiplyScene: ScenePlan<ChainRuleMultiplyScene> = {
  initial(initialData: unknown): ChainRuleMultiplyScene {
    // 자료의 모양만 본다. 가운데 · 출력의 값은 알고리즘이 셈해 silent init 으로 보낸다.
    narrowChainRuleMultiplyData(initialData);
    return { base: null, moves: [null, null, null], whole: null, limit: null, step: 'start' };
  },

  reduce(scene: ChainRuleMultiplyScene, event: FacetRuntimeEvent): ChainRuleMultiplyScene {
    switch (event.type) {
      case 'init': {
        const p = obj(event);
        const s = p.symbols;
        if (!Array.isArray(s) || s.length !== 3 || !s.every((x) => typeof x === 'string')) {
          throw new Error('init.payload.symbols: 글자 셋이 아니다');
        }
        const span = num(p, 'span', 'init');
        if (span <= 0) throw new Error('init.payload.span: 0 보다 커야 한다');
        return {
          base: {
            symbols: [s[0] as string, s[1] as string, s[2] as string],
            inner: terms(p.inner, 'init.payload.inner'),
            outer: terms(p.outer, 'init.payload.outer'),
            x0: num(p, 'x0', 'init'),
            u0: num(p, 'u0', 'init'),
            y0: num(p, 'y0', 'init'),
            span,
          },
          moves: [null, null, null],
          whole: null,
          limit: null,
          step: 'start',
        };
      }
      case 'push': {
        needBase(scene, 'push');
        if (scene.moves[0]) throw new Error('push: 입력이 이미 밀렸다');
        const p = obj(event);
        const move: ChainMove = { to: num(p, 'x1', 'push'), delta: num(p, 'dx', 'push'), ratio: null };
        return { ...scene, moves: [move, null, null], step: 'push' };
      }
      case 'cross': {
        needBase(scene, 'cross');
        const p = obj(event);
        const stage = p.stage;
        const move: ChainMove = {
          to: num(p, 'to', 'cross'),
          delta: num(p, 'delta', 'cross'),
          ratio: num(p, 'ratio', 'cross'),
        };
        const [m0, m1, m2] = scene.moves;
        if (stage === 'inner') {
          if (!m0 || m1) throw new Error('cross.payload.stage: inner 는 입력이 밀린 뒤 한 번만 온다');
          return { ...scene, moves: [m0, move, m2], step: 'inner' };
        }
        if (stage === 'outer') {
          if (!m1 || m2) throw new Error('cross.payload.stage: outer 는 inner 뒤 한 번만 온다');
          return { ...scene, moves: [m0, m1, move], step: 'outer' };
        }
        throw new Error(`cross.payload.stage: 모르는 단계 (${String(stage)})`);
      }
      case 'whole': {
        needBase(scene, 'whole');
        if (!scene.moves[2]) throw new Error('whole: 출력에 움직임이 닿기 전에 왔다');
        const p = obj(event);
        return {
          ...scene,
          whole: { ratio: num(p, 'ratio', 'whole'), r1: num(p, 'r1', 'whole'), r2: num(p, 'r2', 'whole') },
          step: 'whole',
        };
      }
      case 'limit': {
        needBase(scene, 'limit');
        if (!scene.whole) throw new Error('limit: 통째 배 앞에 왔다');
        const p = obj(event);
        return {
          ...scene,
          limit: { d1: num(p, 'd1', 'limit'), d2: num(p, 'd2', 'limit'), d: num(p, 'd', 'limit') },
          step: 'limit',
        };
      }
      default:
        throw new Error(`chainRuleMultiplyScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
