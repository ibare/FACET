/**
 * attend-to-all-at-once 의 장면.
 *
 * 바탕 — 토큰과 입력 벡터 (initialData 에서 베낀다).
 * 자취 — 층마다 쌓이는 점수 표 · 무게 표 · 결과.
 * 이번 걸음 — `step.kind` 로 어느 층이 방금 생겼는지.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowAttendData } from './algorithm.js';

export type AttendFocus = { query: number; key: number; distance: number; neighbor: number };

export type AttendScene = {
  tokens: { id: string; x: number[] }[];
  /** 지금까지 끝난 셈의 층 (0 … 3) */
  layer: number;
  /** 점수가 생긴 짝의 수 */
  pairs: number;
  scores: number[][] | null;
  weights: number[][] | null;
  argmax: number[] | null;
  focus: AttendFocus | null;
  results: number[][] | null;
  reach: { farKey: number; far: number; near: number } | null;
  step: { kind: 'start' | 'scores' | 'weights' | 'results' };
};

function field(payload: unknown, name: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`attend-to-all-at-once 장면: payload 가 객체가 아니다 (${name})`);
  }
  return (payload as Record<string, unknown>)[name];
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`attend-to-all-at-once 장면: ${what} 가 수가 아니다`);
  return v;
}

function matrix(v: unknown, rows: number, cols: number, what: string): number[][] {
  if (!Array.isArray(v) || v.length !== rows) throw new Error(`attend-to-all-at-once 장면: ${what} 의 줄 수가 ${rows} 가 아니다`);
  return v.map((row, i) => {
    if (!Array.isArray(row) || row.length !== cols) throw new Error(`attend-to-all-at-once 장면: ${what}[${i}] 의 칸 수가 ${cols} 가 아니다`);
    return row.map((c, j) => num(c, `${what}[${i}][${j}]`));
  });
}

function index(v: unknown, n: number, what: string): number {
  const k = num(v, what);
  if (!Number.isInteger(k) || k < 0 || k >= n) throw new Error(`attend-to-all-at-once 장면: ${what} 가 토큰 범위 밖이다 (${k})`);
  return k;
}

export const attendToAllAtOnceScene: ScenePlan<AttendScene> = {
  initial(initialData: unknown): AttendScene {
    const data = narrowAttendData(initialData);
    return {
      tokens: data.tokens.map((tok) => ({ id: tok.id, x: [...tok.x] })),
      layer: 0,
      pairs: 0,
      scores: null,
      weights: null,
      argmax: null,
      focus: null,
      results: null,
      reach: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: AttendScene, event: FacetRuntimeEvent): AttendScene {
    const n = scene.tokens.length;
    const dim = scene.tokens[0]!.x.length;
    const p = event.payload;
    switch (event.type) {
      case 'scores':
        return {
          ...scene,
          layer: num(field(p, 'layer'), 'layer'),
          pairs: num(field(p, 'pairs'), 'pairs'),
          scores: matrix(field(p, 'scores'), n, n, 'scores'),
          step: { kind: 'scores' },
        };
      case 'weights': {
        const argRaw = field(p, 'argmax');
        if (!Array.isArray(argRaw) || argRaw.length !== n) throw new Error('attend-to-all-at-once 장면: argmax 의 길이가 토큰 수와 다르다');
        const f = field(p, 'focus');
        return {
          ...scene,
          layer: num(field(p, 'layer'), 'layer'),
          weights: matrix(field(p, 'weights'), n, n, 'weights'),
          argmax: argRaw.map((a, i) => index(a, n, `argmax[${i}]`)),
          focus: {
            query: index(field(f, 'query'), n, 'focus.query'),
            key: index(field(f, 'key'), n, 'focus.key'),
            distance: num(field(f, 'distance'), 'focus.distance'),
            neighbor: index(field(f, 'neighbor'), n, 'focus.neighbor'),
          },
          step: { kind: 'weights' },
        };
      }
      case 'results': {
        const r = field(p, 'reach');
        return {
          ...scene,
          layer: num(field(p, 'layer'), 'layer'),
          results: matrix(field(p, 'results'), n, dim, 'results'),
          reach: {
            farKey: index(field(r, 'farKey'), n, 'reach.farKey'),
            far: num(field(r, 'far'), 'reach.far'), near: num(field(r, 'near'), 'reach.near') },
          step: { kind: 'results' },
        };
      }
      default:
        throw new Error(`attend-to-all-at-once 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
