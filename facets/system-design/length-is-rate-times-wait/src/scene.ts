/**
 * length-is-rate-times-wait 의 장면.
 *
 * 바탕   관측 구간 · 요청 여덟(도착 · 처리 시간) · 칸 높이 상한(init)
 * 자취   드러난 머묾(온 차례) · 머묾의 합 · 셈을 맞춘 결과
 * 이번   step — 준비 / 요청 하나의 머묾 / 셈 맞춤
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowLengthIsRateTimesWait, type QueueRequest } from './algorithm.js';

export type RevealedStay = { id: string; start: number; leave: number; stay: number };

export type BalanceResult = {
  count: number;
  window: number;
  sum: number;
  area: number;
  columns: string[][];
  rate: number;
  meanStay: number;
  meanLength: number;
  product: number;
};

export type LittleStep =
  | { kind: 'ready' }
  | { kind: 'stay'; id: string; before: number }
  | { kind: 'balance' };

export type LengthIsRateTimesWaitScene = {
  window: number;
  requests: QueueRequest[];
  maxStay: number | null;
  maxInSystem: number | null;
  sum: number | null;
  revealed: RevealedStay[];
  balance: BalanceResult | null;
  step: LittleStep;
};

function fail(path: string, why: string): never {
  throw new Error(`length-is-rate-times-wait scene: ${path} — ${why}`);
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${type}.payload.${key}`, '수가 아니다');
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload`, '객체가 아니다');
  return p as Record<string, unknown>;
}

function findRequest(scene: LengthIsRateTimesWaitScene, id: string, path: string): QueueRequest {
  const r = scene.requests.find((q) => q.id === id);
  if (r === undefined) fail(path, `바탕에 없는 요청 ${id}`);
  return r;
}

export const lengthIsRateTimesWaitScene: ScenePlan<LengthIsRateTimesWaitScene> = {
  initial(initialData: unknown): LengthIsRateTimesWaitScene {
    const data = narrowLengthIsRateTimesWait(initialData);
    return {
      window: data.window,
      requests: data.requests.map((r) => ({ ...r })),
      maxStay: null,
      maxInSystem: null,
      sum: null,
      revealed: [],
      balance: null,
      step: { kind: 'ready' },
    };
  },

  reduce(scene: LengthIsRateTimesWaitScene, event: FacetRuntimeEvent): LengthIsRateTimesWaitScene {
    switch (event.type) {
      case 'init': {
        if (scene.revealed.length > 0) fail('init', '머묾이 드러난 뒤에 왔다');
        const p = payloadOf(event);
        const maxStay = num(p, 'maxStay', 'init');
        const maxInSystem = num(p, 'maxInSystem', 'init');
        const sum = num(p, 'sum', 'init');
        if (maxStay < 1 || maxInSystem < 1) fail('init.payload', '칸 높이 상한이 1 보다 작다');
        return { ...scene, maxStay, maxInSystem, sum, revealed: [], balance: null, step: { kind: 'ready' } };
      }
      case 'stay': {
        if (scene.sum === null) fail('stay', 'init 보다 먼저 왔다');
        if (scene.balance !== null) fail('stay', '셈을 맞춘 뒤에 왔다');
        const p = payloadOf(event);
        const id = p.id;
        if (typeof id !== 'string') fail('stay.payload.id', '문자열이 아니다');
        const req = findRequest(scene, id, 'stay.payload.id');
        const next = scene.requests[scene.revealed.length];
        if (next === undefined || next.id !== id) fail('stay.payload.id', `온 차례가 아니다 (${id})`);
        const start = num(p, 'start', 'stay');
        const leave = num(p, 'leave', 'stay');
        const stay = num(p, 'stay', 'stay');
        const sum = num(p, 'sum', 'stay');
        if (start < req.arrive) fail('stay.payload.start', '도착보다 앞선다');
        if (leave - start !== req.service) fail('stay.payload.leave', '처리 시간과 맞지 않는다');
        if (stay !== leave - req.arrive) fail('stay.payload.stay', '떠남 − 도착과 맞지 않는다');
        if (sum !== scene.sum + stay) fail('stay.payload.sum', `앞 합 ${scene.sum} 에 머묾을 보탠 값이 아니다`);
        if (leave > scene.window) fail('stay.payload.leave', '관측 구간 밖이다');
        return {
          ...scene,
          sum,
          revealed: [...scene.revealed, { id, start, leave, stay }],
          step: { kind: 'stay', id, before: scene.sum },
        };
      }
      case 'balance': {
        if (scene.revealed.length !== scene.requests.length) fail('balance', '모든 머묾이 드러나기 전에 왔다');
        const p = payloadOf(event);
        const count = num(p, 'count', 'balance');
        const window = num(p, 'window', 'balance');
        const sum = num(p, 'sum', 'balance');
        const area = num(p, 'area', 'balance');
        if (count !== scene.requests.length) fail('balance.payload.count', '요청 수와 다르다');
        if (window !== scene.window) fail('balance.payload.window', '관측 구간과 다르다');
        if (sum !== scene.sum) fail('balance.payload.sum', '쌓인 머묾의 합과 다르다');
        const rawCols = p.columns;
        if (!Array.isArray(rawCols) || rawCols.length !== scene.window) {
          fail('balance.payload.columns', '관측 구간의 시각 수와 길이가 다르다');
        }
        const columns = rawCols.map((col: unknown, sec: number): string[] => {
          if (!Array.isArray(col)) fail(`balance.payload.columns[${sec}]`, '배열이 아니다');
          return col.map((id: unknown, k: number): string => {
            const path = `balance.payload.columns[${sec}][${k}]`;
            if (typeof id !== 'string') fail(path, '문자열이 아니다');
            findRequest(scene, id, path);
            return id;
          });
        });
        const counted = columns.reduce((acc, c) => acc + c.length, 0);
        if (counted !== area) fail('balance.payload.area', '시각마다 센 수의 합과 다르다');
        if (scene.maxInSystem === null || columns.some((c) => c.length > (scene.maxInSystem as number))) {
          fail('balance.payload.columns', '칸 높이 상한을 넘는다');
        }
        const balance: BalanceResult = {
          count,
          window,
          sum,
          area,
          columns,
          rate: num(p, 'rate', 'balance'),
          meanStay: num(p, 'meanStay', 'balance'),
          meanLength: num(p, 'meanLength', 'balance'),
          product: num(p, 'product', 'balance'),
        };
        return { ...scene, balance, step: { kind: 'balance' } };
      }
      default:
        fail('event.type', `알 수 없는 이벤트 ${event.type}`);
    }
  },
};
