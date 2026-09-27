/**
 * riemann-sum 장면.
 *
 * 바탕(init 이 한 번 정한다): 구간 · 곡선 표본점 · 조각 수 수열 · 참 넓이 · 합 축의 범위.
 * 자취(걸음이 쌓는다): 지금 넓이를 덮은 조각들 · 지금까지 잰 합의 수열 · π 에 닿았는가.
 * 이번 걸음(step): 무엇이 일어났는가와 그 운동의 출발값.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowRiemannSumData } from './algorithm.js';

export type RiemannBase = {
  from: number;
  to: number;
  samples: [number, number][];
  yMax: number;
  counts: number[];
  truth: number;
  sumLo: number;
  sumHi: number;
};

export type RiemannPieces = {
  n: number;
  width: number;
  heights: number[];
  sum: number;
  over: number;
};

export type RiemannStep =
  | { kind: 'start' }
  | { kind: 'cover' }
  | { kind: 'split'; was: number[]; fromSum: number; fromOver: number; fromIndex: number }
  | { kind: 'limit'; fromSum: number };

export type RiemannSumScene = {
  base: RiemannBase | null;
  pieces: RiemannPieces | null;
  /** 지금까지 잰 합 — counts 의 앞에서부터 */
  sums: { n: number; sum: number; over: number }[];
  reachedLimit: boolean;
  step: RiemannStep;
};

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`riemann-sum scene: ${path} 가 수가 아니다`);
  return v;
}

function numList(v: unknown, path: string): number[] {
  if (!Array.isArray(v)) throw new Error(`riemann-sum scene: ${path} 가 배열이 아니다`);
  return v.map((x: unknown, i: number) => num(x, `${path}[${i}]`));
}

function record(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`riemann-sum scene: ${path} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function readBase(p: Record<string, unknown>): RiemannBase {
  if (!Array.isArray(p.samples)) throw new Error('riemann-sum scene: payload.samples 가 배열이 아니다');
  const samples = p.samples.map((s: unknown, i: number): [number, number] => {
    if (!Array.isArray(s) || s.length !== 2) throw new Error(`riemann-sum scene: payload.samples[${i}] 가 [x, y] 가 아니다`);
    return [num(s[0], `payload.samples[${i}][0]`), num(s[1], `payload.samples[${i}][1]`)];
  });
  if (samples.length < 2) throw new Error('riemann-sum scene: payload.samples 가 둘보다 적다');
  const counts = numList(p.counts, 'payload.counts');
  if (counts.length === 0) throw new Error('riemann-sum scene: payload.counts 가 비었다');
  return {
    from: num(p.from, 'payload.from'),
    to: num(p.to, 'payload.to'),
    samples,
    yMax: num(p.yMax, 'payload.yMax'),
    counts,
    truth: num(p.truth, 'payload.truth'),
    sumLo: num(p.sumLo, 'payload.sumLo'),
    sumHi: num(p.sumHi, 'payload.sumHi'),
  };
}

function readPieces(p: Record<string, unknown>): RiemannPieces {
  const n = num(p.n, 'payload.n');
  const heights = numList(p.heights, 'payload.heights');
  if (heights.length !== n) throw new Error(`riemann-sum scene: payload.heights 길이 ${heights.length} 가 n ${n} 과 다르다`);
  return {
    n,
    width: num(p.width, 'payload.width'),
    heights,
    sum: num(p.sum, 'payload.sum'),
    over: num(p.over, 'payload.over'),
  };
}

function needBase(scene: RiemannSumScene, type: string): RiemannBase {
  if (scene.base === null) throw new Error(`riemann-sum scene: ${type} 가 init 보다 먼저 왔다`);
  return scene.base;
}

export const riemannSumScene: ScenePlan<RiemannSumScene> = {
  initial(initialData: unknown): RiemannSumScene {
    // 모양만 본다. 곡선 표본점은 알고리즘이 셈해 silent init 으로 싣는다.
    if (initialData !== undefined) narrowRiemannSumData(initialData);
    return { base: null, pieces: null, sums: [], reachedLimit: false, step: { kind: 'start' } };
  },

  reduce(scene: RiemannSumScene, event: FacetRuntimeEvent): RiemannSumScene {
    switch (event.type) {
      case 'init': {
        const base = readBase(record(event.payload, 'payload'));
        return { base, pieces: null, sums: [], reachedLimit: false, step: { kind: 'start' } };
      }
      case 'cover': {
        const base = needBase(scene, 'cover');
        if (scene.pieces !== null) throw new Error('riemann-sum scene: cover 는 조각이 없을 때만 온다');
        const pieces = readPieces(record(event.payload, 'payload'));
        if (pieces.n !== base.counts[0]) throw new Error(`riemann-sum scene: payload.n ${pieces.n} 가 counts[0] 과 다르다`);
        return {
          base,
          pieces,
          sums: [{ n: pieces.n, sum: pieces.sum, over: pieces.over }],
          reachedLimit: false,
          step: { kind: 'cover' },
        };
      }
      case 'split': {
        const base = needBase(scene, 'split');
        const prev = scene.pieces;
        if (prev === null) throw new Error('riemann-sum scene: split 이 cover 보다 먼저 왔다');
        const p = record(event.payload, 'payload');
        const pieces = readPieces(p);
        const idx = scene.sums.length;
        if (pieces.n !== base.counts[idx]) throw new Error(`riemann-sum scene: payload.n ${pieces.n} 가 counts[${idx}] 와 다르다`);
        if (pieces.n !== prev.n * 2) throw new Error(`riemann-sum scene: payload.n ${pieces.n} 가 앞 조각 수 ${prev.n} 의 두 배가 아니다`);
        const was = numList(p.was, 'payload.was');
        if (was.length !== pieces.n) throw new Error('riemann-sum scene: payload.was 길이가 n 과 다르다');
        was.forEach((w, k) => {
          if (w !== prev.heights[Math.floor(k / 2)]) {
            throw new Error(`riemann-sum scene: payload.was[${k}] 가 앞 장면의 부모 높이와 다르다`);
          }
        });
        return {
          base,
          pieces,
          sums: [...scene.sums, { n: pieces.n, sum: pieces.sum, over: pieces.over }],
          reachedLimit: false,
          step: { kind: 'split', was, fromSum: prev.sum, fromOver: prev.over, fromIndex: idx - 1 },
        };
      }
      case 'limit': {
        const base = needBase(scene, 'limit');
        const prev = scene.pieces;
        if (prev === null) throw new Error('riemann-sum scene: limit 이 조각보다 먼저 왔다');
        const p = record(event.payload, 'payload');
        const truth = num(p.truth, 'payload.truth');
        const fromSum = num(p.fromSum, 'payload.fromSum');
        if (truth !== base.truth) throw new Error('riemann-sum scene: payload.truth 가 바탕의 참 넓이와 다르다');
        if (fromSum !== prev.sum) throw new Error('riemann-sum scene: payload.fromSum 이 지금 합과 다르다');
        return {
          base,
          pieces: prev,
          sums: [...scene.sums],
          reachedLimit: true,
          step: { kind: 'limit', fromSum },
        };
      }
      default:
        throw new Error(`riemann-sum scene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
