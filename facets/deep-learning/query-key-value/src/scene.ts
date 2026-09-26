/**
 * query-key-value 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 한다.
 *
 * 바탕: 토큰 · 입력 x · 묻는 토큰 (initialData 에서 베낀다)
 * 자취: 물음 · 열쇠 · 값 · 맞춰 보기 · 무게 · 가져온 값 (걸음마다 하나씩 채워진다)
 * 이번 걸음: step.kind
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { Role, Vec2 } from './algorithm.js';

export type QkvStep =
  | { kind: 'start' }
  | { kind: 'query' }
  | { kind: 'keys' }
  | { kind: 'values' }
  | { kind: 'match' }
  | { kind: 'weigh' }
  | { kind: 'fetch' };

export type QkvScene = {
  tokens: string[];
  xs: Vec2[];
  asker: string;
  q: Vec2 | null;
  keys: Vec2[] | null;
  values: Vec2[] | null;
  raw: number[] | null;
  scores: number[] | null;
  dk: number | null;
  weights: number[] | null;
  best: number | null;
  sum: number | null;
  result: Vec2 | null;
  dist: Record<Role, number> | null;
  nearest: Role | null;
  step: QkvStep;
};

function asVec2(v: unknown, what: string): Vec2 {
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number') {
    return [v[0], v[1]];
  }
  throw new Error(`query-key-value 장면: ${what} 가 길이 2 인 벡터가 아니다`);
}

function asNumbers(v: unknown, n: number, what: string): number[] {
  if (Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number')) return [...(v as number[])];
  throw new Error(`query-key-value 장면: ${what} 가 수 ${n} 개가 아니다`);
}

function asVecs(v: unknown, n: number, what: string): Vec2[] {
  if (!Array.isArray(v) || v.length !== n) throw new Error(`query-key-value 장면: ${what} 가 벡터 ${n} 개가 아니다`);
  return v.map((x, i) => asVec2(x, `${what}[${i}]`));
}

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('query-key-value 장면: payload 가 객체가 아니다');
  }
  return (payload as Record<string, unknown>)[key];
}

function asDk(v: unknown): number {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
  throw new Error(`query-key-value 장면: dk ${String(v)} 가 양의 정수가 아니다`);
}

function asRole(v: unknown): Role {
  if (v === 'x' || v === 'k' || v === 'v') return v;
  throw new Error(`query-key-value 장면: 모르는 역할 ${String(v)}`);
}

export const queryKeyValueScene: ScenePlan<QkvScene> = {
  initial(initialData: unknown): QkvScene {
    if (typeof initialData !== 'object' || initialData === null) {
      throw new Error('query-key-value 장면: initialData 가 없다');
    }
    const d = initialData as Record<string, unknown>;
    const tokens = d.tokens;
    if (!Array.isArray(tokens) || tokens.length === 0 || !tokens.every((s) => typeof s === 'string')) {
      throw new Error('query-key-value 장면: tokens 가 글자 줄이 아니다');
    }
    const xs = asVecs(d.x, tokens.length, 'x');
    if (typeof d.asker !== 'string' || !tokens.includes(d.asker)) {
      throw new Error('query-key-value 장면: 묻는 토큰이 토큰 줄에 없다');
    }
    return {
      tokens: [...(tokens as string[])],
      xs,
      asker: d.asker,
      q: null,
      keys: null,
      values: null,
      raw: null,
      scores: null,
      dk: null,
      weights: null,
      best: null,
      sum: null,
      result: null,
      dist: null,
      nearest: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: QkvScene, event: FacetRuntimeEvent): QkvScene {
    const n = scene.tokens.length;
    const p = event.payload;
    switch (event.type) {
      case 'query':
        return { ...scene, q: asVec2(field(p, 'vec'), 'q'), step: { kind: 'query' } };
      case 'keys':
        return { ...scene, keys: asVecs(field(p, 'vecs'), n, 'keys'), step: { kind: 'keys' } };
      case 'values':
        return { ...scene, values: asVecs(field(p, 'vecs'), n, 'values'), step: { kind: 'values' } };
      case 'match':
        return {
          ...scene,
          raw: asNumbers(field(p, 'raw'), n, 'raw'),
          dk: asDk(field(p, 'dk')),
          scores: asNumbers(field(p, 'scores'), n, 'scores'),
          step: { kind: 'match' },
        };
      case 'weigh': {
        const best = field(p, 'best');
        const sum = field(p, 'sum');
        if (typeof best !== 'number' || !Number.isInteger(best) || best < 0 || best >= n) {
          throw new Error(`query-key-value 장면: best 자리 ${String(best)} 가 토큰 밖이다`);
        }
        if (typeof sum !== 'number') throw new Error('query-key-value 장면: sum 이 수가 아니다');
        return { ...scene, weights: asNumbers(field(p, 'weights'), n, 'weights'), best, sum, step: { kind: 'weigh' } };
      }
      case 'fetch': {
        const d = field(p, 'dist');
        return {
          ...scene,
          result: asVec2(field(p, 'result'), 'result'),
          dist: {
            x: asNumbers([field(d, 'x')], 1, 'dist.x')[0]!,
            k: asNumbers([field(d, 'k')], 1, 'dist.k')[0]!,
            v: asNumbers([field(d, 'v')], 1, 'dist.v')[0]!,
          },
          nearest: asRole(field(p, 'nearest')),
          step: { kind: 'fetch' },
        };
      }
      default:
        throw new Error(`query-key-value 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
