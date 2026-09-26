/**
 * retry-storm 장면 — 이벤트를 잇기만 한다. 받는 차례 · 받은 수 · 실패는 알고리즘이 셈해 싣는다.
 *
 * 바탕: 틱 수 · 감당 · 세로 축척(가장 큰 몰림 — silent init 이 싣는다)
 * 자취: 지난 틱마다의 칸(몰림을 받는 차례로, 받았는가) · 다음 틱에 다시 올 무더기
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowRetryStormData } from './algorithm';

export type RetryStormArrival = {
  id: string;
  /** 다시 온 요청인가 (아니면 새 요청) */
  retry: boolean;
  /** 받았는가 (아니면 실패) */
  served: boolean;
};

export type RetryStormColumn = {
  tick: number;
  down: boolean;
  /** 받는 차례 — 아래에서 위로 쌓인다 */
  arrivals: RetryStormArrival[];
};

export type RetryStormStep =
  | { kind: 'start' }
  | {
      kind: 'tick';
      tick: number;
      down: boolean;
      recovered: boolean;
      /** 무더기에서 떠난 요청 — 떠나기 전 무더기의 차례 그대로 (출발 자리) */
      retry: string[];
      fresh: string[];
      served: number;
      failed: string[];
      last: { afterTicks: number; afterFailed: number } | null;
    };

export type RetryStormScene = {
  ticks: number;
  capacity: number;
  /** 세로 축척. init 전(자료만 있는 때)에는 아직 없다 */
  maxLoad: number | null;
  columns: RetryStormColumn[];
  /** 다음 틱에 다시 올 무더기 — 실패한 차례 그대로 */
  pile: string[];
  step: RetryStormStep;
};

function field(payload: Record<string, unknown>, key: string): unknown {
  if (!(key in payload)) throw new Error(`retry-storm 장면: payload.${key} 가 없다`);
  return payload[key];
}

function num(payload: Record<string, unknown>, key: string): number {
  const v = field(payload, key);
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error(`retry-storm 장면: payload.${key} 가 0 이상의 정수가 아니다`);
  return v;
}

function bool(payload: Record<string, unknown>, key: string): boolean {
  const v = field(payload, key);
  if (typeof v !== 'boolean') throw new Error(`retry-storm 장면: payload.${key} 가 참거짓이 아니다`);
  return v;
}

function ids(payload: Record<string, unknown>, key: string): string[] {
  const v = field(payload, key);
  if (!Array.isArray(v)) throw new Error(`retry-storm 장면: payload.${key} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'string' || x === '') throw new Error(`retry-storm 장면: payload.${key}[${i}] 가 식별자가 아니다`);
    return x;
  });
}

function record(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`retry-storm 장면: ${event.type} 의 payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export const retryStormScene: ScenePlan<RetryStormScene> = {
  initial(initialData: unknown): RetryStormScene {
    const data = narrowRetryStormData(initialData);
    return {
      ticks: data.ticks,
      capacity: data.capacity,
      maxLoad: null,
      columns: [],
      pile: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: RetryStormScene, event: FacetRuntimeEvent): RetryStormScene {
    switch (event.type) {
      case 'init': {
        const p = record(event);
        const ticks = num(p, 'ticks');
        const capacity = num(p, 'capacity');
        const maxLoad = num(p, 'maxLoad');
        if (ticks !== scene.ticks) throw new Error(`retry-storm 장면: init.ticks ${ticks} 가 자료의 ${scene.ticks} 와 다르다`);
        if (capacity !== scene.capacity) throw new Error(`retry-storm 장면: init.capacity ${capacity} 가 자료의 ${scene.capacity} 와 다르다`);
        if (maxLoad < 1) throw new Error('retry-storm 장면: init.maxLoad 가 1 보다 작다');
        return { ...scene, maxLoad, columns: [], pile: [], step: { kind: 'start' } };
      }
      case 'tick': {
        if (scene.maxLoad === null) throw new Error('retry-storm 장면: init 전에 tick 이 왔다');
        const p = record(event);
        const tick = num(p, 'tick');
        const down = bool(p, 'down');
        const recovered = bool(p, 'recovered');
        const retry = ids(p, 'retry');
        const fresh = ids(p, 'fresh');
        const order = ids(p, 'order');
        const served = num(p, 'served');
        const failed = ids(p, 'failed');
        const lastRaw = field(p, 'last');
        let last: { afterTicks: number; afterFailed: number } | null = null;
        if (lastRaw !== null) {
          if (typeof lastRaw !== 'object') throw new Error('retry-storm 장면: payload.last 가 객체도 null 도 아니다');
          const l = lastRaw as Record<string, unknown>;
          last = { afterTicks: num(l, 'afterTicks'), afterFailed: num(l, 'afterFailed') };
        }

        if (tick !== scene.columns.length) throw new Error(`retry-storm 장면: payload.tick ${tick} 가 다음 틱 ${scene.columns.length} 가 아니다`);
        if (tick >= scene.ticks) throw new Error(`retry-storm 장면: payload.tick ${tick} 가 틱 범위 밖이다`);
        if (!sameList(retry, scene.pile)) throw new Error('retry-storm 장면: payload.retry 가 지금 무더기와 다르다');
        if (order.length !== retry.length + fresh.length) throw new Error('retry-storm 장면: payload.order 의 수가 retry + fresh 와 다르다');
        const retrySet = new Set(retry);
        const freshSet = new Set(fresh);
        const orderSet = new Set(order);
        if (orderSet.size !== order.length) throw new Error('retry-storm 장면: payload.order 에 겹친 식별자가 있다');
        for (const id of order) {
          if (!retrySet.has(id) && !freshSet.has(id)) throw new Error(`retry-storm 장면: payload.order 의 ${id} 가 retry 에도 fresh 에도 없다`);
        }
        if (served > order.length || served > scene.capacity) throw new Error('retry-storm 장면: payload.served 가 몰림이나 감당보다 크다');
        if (down && served !== 0) throw new Error('retry-storm 장면: 끊긴 틱인데 payload.served 가 0 이 아니다');
        if (!sameList(failed, order.slice(served))) throw new Error('retry-storm 장면: payload.failed 가 order 의 받은 것 뒤와 다르다');
        if (recovered && down) throw new Error('retry-storm 장면: 끊긴 틱이 살아났다고 한다');

        const column: RetryStormColumn = {
          tick,
          down,
          arrivals: order.map((id, k) => ({ id, retry: retrySet.has(id), served: k < served })),
        };
        return {
          ...scene,
          columns: [...scene.columns, column],
          pile: [...failed],
          step: { kind: 'tick', tick, down, recovered, retry: [...retry], fresh: [...fresh], served, failed: [...failed], last },
        };
      }
      default:
        throw new Error(`retry-storm 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
