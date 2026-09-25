/**
 * seek-distance-costs 장면 — serve 이벤트를 잇는다. 셈은 알고리즘이 했고 여기서는 옮겨 담기만 한다.
 *
 * 바탕  base    실린더 수 · 팔의 처음 자리 · 요청 줄 · 모형의 두 수 (initialData 에서 베낀다)
 * 자취  arm · served · sums
 * 이번  step    걸음 0 이면 start, 아니면 방금 처리한 요청의 index
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { checkSeekData, type SeekDistanceCostsFacetData } from './algorithm.js';

export type SeekBase = {
  cylinders: number;
  start: number;
  requests: number[];
  msPerCylinder: number;
  fixedMs: number;
};

export type ServedRequest = {
  index: number;
  from: number;
  to: number;
  distance: number;
  seekMs: number;
  totalMs: number;
  sameAs: number[];
};

export type SeekSums = {
  distance: number;
  seekMs: number;
  fixedMs: number;
  totalMs: number;
};

export type SeekStep = { kind: 'start' } | { kind: 'serve'; index: number };

export type SeekScene = {
  base: SeekBase;
  arm: number;
  served: ServedRequest[];
  sums: SeekSums;
  step: SeekStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function numField(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`seek-distance-costs 장면: serve 의 ${key} 가 수가 아니다`);
  }
  return v;
}

function indexList(p: Record<string, unknown>, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`seek-distance-costs 장면: serve 의 ${key} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) {
      throw new Error(`seek-distance-costs 장면: serve 의 ${key} 에 정수가 아닌 것이 있다`);
    }
    return x;
  });
}

function readData(initialData: unknown): SeekBase {
  if (!isRecord(initialData)) throw new Error('seek-distance-costs 장면: initialData 가 없다');
  const { cylinders, start, requests, msPerCylinder, fixedMs } = initialData;
  if (
    typeof cylinders !== 'number' ||
    typeof start !== 'number' ||
    typeof msPerCylinder !== 'number' ||
    typeof fixedMs !== 'number' ||
    !Array.isArray(requests) ||
    !requests.every((r): r is number => typeof r === 'number')
  ) {
    throw new Error('seek-distance-costs 장면: initialData 의 모양이 옳지 않다');
  }
  const base: SeekBase = { cylinders, start, requests: [...requests], msPerCylinder, fixedMs };
  const probe: SeekDistanceCostsFacetData = { type: 'seek-distance-costs', stepMs: 0, ...base };
  checkSeekData(probe);
  return base;
}

export const seekDistanceCostsScene: ScenePlan<SeekScene> = {
  initial(initialData: unknown): SeekScene {
    const base = readData(initialData);
    return {
      base,
      arm: base.start,
      served: [],
      sums: { distance: 0, seekMs: 0, fixedMs: 0, totalMs: 0 },
      step: { kind: 'start' },
    };
  },

  reduce(scene: SeekScene, event: FacetRuntimeEvent): SeekScene {
    if (event.type !== 'serve') return scene;
    const p = event.payload;
    if (!isRecord(p)) throw new Error('seek-distance-costs 장면: serve 에 payload 가 없다');
    const served: ServedRequest = {
      index: numField(p, 'index'),
      from: numField(p, 'from'),
      to: numField(p, 'to'),
      distance: numField(p, 'distance'),
      seekMs: numField(p, 'seekMs'),
      totalMs: numField(p, 'totalMs'),
      sameAs: indexList(p, 'sameAs'),
    };
    return {
      base: scene.base,
      arm: served.to,
      served: [...scene.served, served],
      sums: {
        distance: numField(p, 'sumDistance'),
        seekMs: numField(p, 'sumSeekMs'),
        fixedMs: numField(p, 'sumFixedMs'),
        totalMs: numField(p, 'sumTotalMs'),
      },
      step: { kind: 'serve', index: served.index },
    };
  },
};
