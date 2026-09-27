/**
 * histogram-shape 장면 — 칸 여섯에 표본이 쌓이는 상태.
 *
 * 바탕: faces (칸의 수)
 * 자취: samples · bins (지금까지 쌓인 개수)
 * 이번 걸음: step (쌓기 전 개수 · 칸마다 더해진 개수 · 떨어진 차례 · 두 눈) · order (쌓은 뒤 차례)
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowHistogramShapeData, type OrderState } from './algorithm.js';

export type HistogramShapeStep = {
  from: number;
  to: number;
  before: number[];
  added: number[];
  drops: number[];
  roll: { a: number; b: number } | null;
};

export type HistogramShapeScene = {
  faces: number;
  samples: number;
  bins: number[];
  step: HistogramShapeStep | null;
  order: OrderState | null;
};

function intArray(v: unknown, path: string, len?: number): number[] {
  if (!Array.isArray(v)) throw new Error(`histogram-shape 장면: ${path} 가 배열이 아니다`);
  if (len !== undefined && v.length !== len) throw new Error(`histogram-shape 장면: ${path} 의 길이가 ${len} 이 아니다 (${v.length})`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0) throw new Error(`histogram-shape 장면: ${path}[${i}] 가 0 이상의 정수가 아니다`);
    return x;
  });
}

function int(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`histogram-shape 장면: ${path} 가 정수가 아니다`);
  return v;
}

function faceNum(v: unknown, path: string, faces: number): number {
  const n = int(v, path);
  if (n < 1 || n > faces) throw new Error(`histogram-shape 장면: ${path} 가 1..${faces} 밖이다 (${n})`);
  return n;
}

function readOrder(v: unknown, faces: number): OrderState {
  if (typeof v !== 'object' || v === null) throw new Error('histogram-shape 장면: payload.order 가 객체가 아니다');
  const o = v as Record<string, unknown>;
  if (o.kind === 'ordered') return { kind: 'ordered' };
  if (o.kind === 'inverted' || o.kind === 'level') {
    const taller = faceNum(o.taller, 'payload.order.taller', faces);
    const shorter = faceNum(o.shorter, 'payload.order.shorter', faces);
    if (taller >= shorter) throw new Error('histogram-shape 장면: payload.order.taller 가 shorter 보다 작은 눈이 아니다');
    return { kind: o.kind, taller, shorter };
  }
  throw new Error(`histogram-shape 장면: payload.order.kind 를 모른다 (${String(o.kind)})`);
}

export const histogramShapeScene: ScenePlan<HistogramShapeScene> = {
  initial(initialData: unknown): HistogramShapeScene {
    const data = narrowHistogramShapeData(initialData);
    // 표본 수열의 첫 값이 0 이라(좁히개가 확인) 걸음 0 의 칸은 모두 비어 있다
    return { faces: data.faces, samples: 0, bins: new Array<number>(data.faces).fill(0), step: null, order: null };
  },

  reduce(scene: HistogramShapeScene, event: FacetRuntimeEvent): HistogramShapeScene {
    if (event.type !== 'pour') throw new Error(`histogram-shape 장면: 모르는 이벤트 '${event.type}'`);
    const p = event.payload;
    if (typeof p !== 'object' || p === null) throw new Error('histogram-shape 장면: pour 의 payload 가 객체가 아니다');
    const r = p as Record<string, unknown>;
    const faces = scene.faces;
    const from = int(r.from, 'payload.from');
    const to = int(r.to, 'payload.to');
    if (from !== scene.samples) throw new Error(`histogram-shape 장면: payload.from(${from}) 이 지금 표본 수(${scene.samples}) 와 다르다`);
    if (to <= from) throw new Error('histogram-shape 장면: payload.to 가 from 보다 크지 않다');
    const before = intArray(r.before, 'payload.before', faces);
    const after = intArray(r.after, 'payload.after', faces);
    const added = intArray(r.added, 'payload.added', faces);
    before.forEach((c, i) => {
      if (c !== scene.bins[i]) throw new Error(`histogram-shape 장면: payload.before[${i}] 가 지금 칸과 다르다`);
      if (c + added[i]! !== after[i]) throw new Error(`histogram-shape 장면: payload.after[${i}] 가 before + added 가 아니다`);
    });
    const drops = intArray(r.drops, 'payload.drops', to - from).map((d, i) => faceNum(d, `payload.drops[${i}]`, faces));
    let roll: { a: number; b: number } | null = null;
    if (r.roll !== null) {
      if (typeof r.roll !== 'object' || r.roll === undefined) throw new Error('histogram-shape 장면: payload.roll 이 객체도 null 도 아니다');
      const rr = r.roll as Record<string, unknown>;
      roll = { a: faceNum(rr.a, 'payload.roll.a', faces), b: faceNum(rr.b, 'payload.roll.b', faces) };
      if (drops.length !== 1 || Math.max(roll.a, roll.b) !== drops[0]) throw new Error('histogram-shape 장면: payload.roll 의 큰 눈이 떨어진 눈과 다르다');
    }
    return {
      faces,
      samples: to,
      bins: after,
      step: { from, to, before, added, drops, roll },
      order: readOrder(r.order, faces),
    };
  },
};
