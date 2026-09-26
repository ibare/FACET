import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowOrderData, type RowId } from './algorithm.js';

/** 한 줄의 지금 모습. inputs 는 줄의 차례대로 (표시를 더했으면 x + PE). */
export type OrderRow = {
  order: string[];
  inputs: number[][];
  marked: boolean;
  weights: number[] | null;
  result: number[] | null;
  /** 표시 없이 셈한 결과 — 표시를 더한 뒤에도 흔적으로 남긴다 */
  plain: number[] | null;
};

export type OrderStep =
  | { kind: 'start' }
  | { kind: 'attend'; row: RowId }
  | { kind: 'swap'; row: RowId }
  | { kind: 'marks' }
  | { kind: 'addMarks'; row: RowId; from: number[]; fromWeights: number[] }
  | { kind: 'distance' };

/** 결과 평면에 찍힐 점을 감싸는 범위 (알고리즘이 셈해 init 으로 보낸다) */
export type OrderExtent = { x0: number; x1: number; y0: number; y1: number };

export type OrderScene = {
  // 바탕
  extent: OrderExtent | null;
  tokens: { id: string; x: number[] }[];
  orders: Record<RowId, string[]>;
  track: string;
  // 자취
  rows: { first: OrderRow; second: OrderRow | null };
  marks: number[][] | null;
  plainDiff: number | null;
  markedDiff: number | null;
  // 이번 걸음
  step: OrderStep;
};

function xOf(scene: OrderScene, id: string): number[] {
  const tk = scene.tokens.find((k) => k.id === id);
  if (!tk) throw new Error(`orderMustBeAddedScene: 토큰 ${id} 를 모른다`);
  return tk.x.slice();
}

function numList(v: unknown, what: string): number[] {
  if (!Array.isArray(v) || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new Error(`orderMustBeAddedScene: ${what} 가 수의 배열이 아니다`);
  }
  return (v as number[]).slice();
}

function numMatrix(v: unknown, what: string): number[][] {
  if (!Array.isArray(v)) throw new Error(`orderMustBeAddedScene: ${what} 가 배열이 아니다`);
  return v.map((r, i) => numList(r, `${what}[${i}]`));
}

function rowOf(v: unknown): RowId {
  if (v === 'first' || v === 'second') return v;
  throw new Error(`orderMustBeAddedScene: 모르는 줄 ${String(v)}`);
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`orderMustBeAddedScene: ${what} 가 수가 아니다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`orderMustBeAddedScene: ${event.type} 의 payload 가 없다`);
  return p as Record<string, unknown>;
}

function plainRow(scene: OrderScene, order: string[]): OrderRow {
  return { order: order.slice(), inputs: order.map((id) => xOf(scene, id)), marked: false, weights: null, result: null, plain: null };
}

export const orderMustBeAddedScene: ScenePlan<OrderScene> = {
  initial(initialData: unknown): OrderScene {
    const data = narrowOrderData(initialData);
    const base: OrderScene = {
      extent: null,
      tokens: data.tokens.map((tk) => ({ id: tk.id, x: tk.x.slice() })),
      orders: { first: data.orders.first.slice(), second: data.orders.second.slice() },
      track: data.track,
      rows: { first: { order: [], inputs: [], marked: false, weights: null, result: null, plain: null }, second: null },
      marks: null,
      plainDiff: null,
      markedDiff: null,
      step: { kind: 'start' },
    };
    return { ...base, rows: { first: plainRow(base, base.orders.first), second: null } };
  },

  reduce(scene: OrderScene, event: FacetRuntimeEvent): OrderScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const e = p.extent;
        if (typeof e !== 'object' || e === null) throw new Error('orderMustBeAddedScene: init 에 extent 가 없다');
        const r = e as Record<string, unknown>;
        const extent: OrderExtent = { x0: num(r.x0, 'x0'), x1: num(r.x1, 'x1'), y0: num(r.y0, 'y0'), y1: num(r.y1, 'y1') };
        if (!(extent.x0 <= extent.x1 && extent.y0 <= extent.y1)) throw new Error('orderMustBeAddedScene: extent 의 양 끝이 뒤집혔다');
        return { ...scene, extent };
      }
      case 'attend': {
        const p = payloadOf(event);
        const row = rowOf(p.row);
        if (row !== 'first') throw new Error('orderMustBeAddedScene: attend 는 첫 줄에서만 온다');
        const weights = numList(p.weights, 'weights');
        const result = numList(p.result, 'result');
        const first: OrderRow = { ...scene.rows.first, weights, result, plain: result.slice() };
        return { ...scene, rows: { ...scene.rows, first }, step: { kind: 'attend', row } };
      }
      case 'swap': {
        const p = payloadOf(event);
        const row = rowOf(p.row);
        if (row !== 'second') throw new Error('orderMustBeAddedScene: swap 은 뒤바꾼 줄에서만 온다');
        const weights = numList(p.weights, 'weights');
        const result = numList(p.result, 'result');
        const second: OrderRow = { ...plainRow(scene, scene.orders.second), weights, result, plain: result.slice() };
        return {
          ...scene,
          rows: { ...scene.rows, second },
          plainDiff: num(p.diff, 'diff'),
          step: { kind: 'swap', row },
        };
      }
      case 'marks': {
        const p = payloadOf(event);
        return { ...scene, marks: numMatrix(p.marks, 'marks'), step: { kind: 'marks' } };
      }
      case 'addMarks': {
        const p = payloadOf(event);
        const row = rowOf(p.row);
        const was = scene.rows[row];
        if (!was || !was.result || !was.weights) throw new Error(`orderMustBeAddedScene: ${row} 줄의 앞 결과가 없다`);
        const next: OrderRow = {
          ...was,
          inputs: numMatrix(p.inputs, 'inputs'),
          marked: true,
          weights: numList(p.weights, 'weights'),
          result: numList(p.result, 'result'),
        };
        return {
          ...scene,
          rows: row === 'first' ? { first: next, second: scene.rows.second } : { first: scene.rows.first, second: next },
          step: { kind: 'addMarks', row, from: was.result.slice(), fromWeights: was.weights.slice() },
        };
      }
      case 'distance': {
        const p = payloadOf(event);
        return { ...scene, markedDiff: num(p.diff, 'diff'), plainDiff: num(p.was, 'was'), step: { kind: 'distance' } };
      }
      default:
        throw new Error(`orderMustBeAddedScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
