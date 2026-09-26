import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowRescaleData } from './algorithm';

/** 묶음이 지나온 마디 — 처음 · 자리 맞춤 뒤 · 폭 맞춤 뒤 */
export type RescalePhase = 'raw' | 'centered' | 'scaled';

export type RescaleBatchState = {
  id: string;
  /** 지금 값 (묶음 안 차례 그대로) */
  values: number[];
  phase: RescalePhase;
  /** 지금 평균 · 폭(모집단 표준편차). 바탕이 서기 전에는 null */
  mean: number | null;
  std: number | null;
};

export type RescaleStep =
  | { kind: 'start' }
  | {
      kind: 'center';
      batch: string;
      /** 뺀 평균 */
      mu: number;
      from: number[];
      meanBefore: number;
      stdBefore: number;
      stdAfter: number;
    }
  | {
      kind: 'scale';
      batch: string;
      /** √(σ² + ε) */
      divisor: number;
      from: number[];
      meanBefore: number;
      stdBefore: number;
      stdAfter: number;
    };

export type RescaleEachBatchScene = {
  /** 바탕 — init 이 한 번 정한다: 화면 축의 범위 */
  range: { min: number; max: number } | null;
  /** 자취 — 걸음이 쌓는 묶음의 지금 모습 */
  batches: RescaleBatchState[];
  /** 이번 걸음 */
  step: RescaleStep;
};

function fail(msg: string): never {
  throw new Error(`rescaleEachBatchScene: ${msg}`);
}

function obj(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${where} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${where} 가 수가 아니다`);
  return v;
}

function str(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') fail(`${where} 가 글자가 아니다`);
  return v;
}

function nums(v: unknown, where: string, length: number): number[] {
  if (!Array.isArray(v)) fail(`${where} 가 배열이 아니다`);
  if (v.length !== length) fail(`${where} 의 길이가 ${length} 가 아니다 (${v.length})`);
  return v.map((x, i) => num(x, `${where}[${i}]`));
}

function findBatch(scene: RescaleEachBatchScene, id: string, where: string): number {
  const i = scene.batches.findIndex((b) => b.id === id);
  if (i < 0) fail(`${where} 의 묶음 ${id} 가 바탕에 없다`);
  return i;
}

export const rescaleEachBatchScene: ScenePlan<RescaleEachBatchScene> = {
  initial(initialData: unknown): RescaleEachBatchScene {
    const data = narrowRescaleData(initialData);
    return {
      range: null,
      batches: data.batches.map((b) => ({
        id: b.id,
        values: [...b.values],
        phase: 'raw',
        mean: null,
        std: null,
      })),
      step: { kind: 'start' },
    };
  },

  reduce(scene: RescaleEachBatchScene, event: FacetRuntimeEvent): RescaleEachBatchScene {
    if (event.type !== 'init' && event.type !== 'center' && event.type !== 'scale') {
      fail(`모르는 이벤트 ${event.type}`);
    }
    const p = obj(event.payload, `${event.type}.payload`);
    switch (event.type) {
      case 'init': {
        if (scene.range !== null) fail('init 이 두 번 왔다');
        const r = obj(p.range, 'init.payload.range');
        const min = num(r.min, 'init.payload.range.min');
        const max = num(r.max, 'init.payload.range.max');
        if (!(max > min)) fail('init.payload.range 의 max 가 min 보다 크지 않다');
        if (!Array.isArray(p.batches)) fail('init.payload.batches 가 배열이 아니다');
        if (p.batches.length !== scene.batches.length) fail('init.payload.batches 의 수가 바탕과 다르다');
        const batches = scene.batches.map((b, i) => {
          const s = obj((p.batches as unknown[])[i], `init.payload.batches[${i}]`);
          const id = str(s.id, `init.payload.batches[${i}].id`);
          if (id !== b.id) fail(`init.payload.batches[${i}].id 가 ${b.id} 가 아니다 (${id})`);
          return {
            ...b,
            values: [...b.values],
            mean: num(s.mean, `init.payload.batches[${i}].mean`),
            std: num(s.std, `init.payload.batches[${i}].std`),
          };
        });
        return { range: { min, max }, batches, step: { kind: 'start' } };
      }
      case 'center':
      case 'scale': {
        if (scene.range === null) fail(`${event.type} 가 init 보다 먼저 왔다`);
        const id = str(p.batch, `${event.type}.payload.batch`);
        const i = findBatch(scene, id, `${event.type}.payload.batch`);
        const cur = scene.batches[i]!;
        const want: RescalePhase = event.type === 'center' ? 'raw' : 'centered';
        if (cur.phase !== want) fail(`${event.type}: 묶음 ${id} 의 마디가 ${want} 가 아니다 (${cur.phase})`);
        if (cur.mean === null || cur.std === null) fail(`${event.type}: 묶음 ${id} 의 통계가 서지 않았다`);
        const values = nums(p.values, `${event.type}.payload.values`, cur.values.length);
        const meanAfter = num(p.meanAfter, `${event.type}.payload.meanAfter`);
        const stdBefore = num(p.stdBefore, `${event.type}.payload.stdBefore`);
        const stdAfter = num(p.stdAfter, `${event.type}.payload.stdAfter`);
        if (Math.abs(stdBefore - cur.std) > 1e-9) fail(`${event.type}.payload.stdBefore 가 지금 폭과 다르다`);
        const next: RescaleBatchState = {
          id,
          values,
          phase: event.type === 'center' ? 'centered' : 'scaled',
          mean: meanAfter,
          std: stdAfter,
        };
        const from = [...cur.values];
        const meanBefore = cur.mean;
        const step: RescaleStep =
          event.type === 'center'
            ? { kind: 'center', batch: id, mu: num(p.mean, 'center.payload.mean'), from, meanBefore, stdBefore, stdAfter }
            : { kind: 'scale', batch: id, divisor: num(p.divisor, 'scale.payload.divisor'), from, meanBefore, stdBefore, stdAfter };
        return {
          range: { ...scene.range },
          batches: scene.batches.map((b, j) => (j === i ? next : { ...b, values: [...b.values] })),
          step,
        };
      }
      default:
        fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
