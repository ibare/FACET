/**
 * slide-the-kernel 장면 — 이벤트를 잇기만 한다. 곱 · 합 · 출력 크기는 알고리즘이 셈해 싣는다.
 *
 * 바탕: input · kernel · outRows · outCols (silent init 이 걸음 0 에 채운다)
 * 자취: outputs (찬 출력 칸)
 * 지금: seat (창이 앉은 자리) · target (이 자리가 채울 출력 칸) · products · sum · written
 * 이번 걸음: step — seat 걸음은 창이 떠난 자리 from 을 싣는다 (null 이면 창이 아직 앉지 않았던 자리)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type Cell = { row: number; col: number };

export type SlideTheKernelStep =
  | { kind: 'seat'; seat: Cell; from: Cell | null; target: Cell; count: number }
  | { kind: 'write'; target: Cell; sum: number; filled: number; total: number };

export type SlideTheKernelScene = {
  input: number[][];
  kernel: number[][];
  outRows: number;
  outCols: number;
  outputs: (number | null)[][];
  seat: Cell | null;
  target: Cell | null;
  products: number[] | null;
  sum: number | null;
  written: Cell | null;
  step: SlideTheKernelStep | null;
};

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('slide-the-kernel 장면: payload 가 객체가 아니다');
  }
  return (payload as Record<string, unknown>)[key];
}

function int(payload: unknown, key: string): number {
  const v = field(payload, key);
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`slide-the-kernel 장면: ${key} 가 정수가 아니다`);
  }
  return v;
}

function numbers(v: unknown, key: string): number[] {
  if (!Array.isArray(v)) throw new Error(`slide-the-kernel 장면: ${key} 가 배열이 아니다`);
  return v.map((x: unknown) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      throw new Error(`slide-the-kernel 장면: ${key} 에 수가 아닌 값이 있다`);
    }
    return x;
  });
}

function grid(payload: unknown, key: string): number[][] {
  const v = field(payload, key);
  if (!Array.isArray(v) || v.length === 0) throw new Error(`slide-the-kernel 장면: ${key} 가 빈 격자이거나 격자가 아니다`);
  const rows = v.map((row: unknown) => numbers(row, key));
  const width = rows[0]?.length;
  if (width === undefined || width === 0 || rows.some((r) => r.length !== width)) {
    throw new Error(`slide-the-kernel 장면: ${key} 의 행 길이가 비었거나 서로 다르다`);
  }
  return rows;
}

function emptyOutputs(rows: number, cols: number): (number | null)[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

export const slideTheKernelScene: ScenePlan<SlideTheKernelScene> = {
  initial(): SlideTheKernelScene {
    return {
      input: [],
      kernel: [],
      outRows: 0,
      outCols: 0,
      outputs: [],
      seat: null,
      target: null,
      products: null,
      sum: null,
      written: null,
      step: null,
    };
  },

  reduce(scene: SlideTheKernelScene, event: FacetRuntimeEvent): SlideTheKernelScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        const outRows = int(p, 'outRows');
        const outCols = int(p, 'outCols');
        return {
          ...slideTheKernelScene.initial(undefined),
          input: grid(p, 'input'),
          kernel: grid(p, 'kernel'),
          outRows,
          outCols,
          outputs: emptyOutputs(outRows, outCols),
        };
      }
      case 'seat': {
        const seat = { row: int(p, 'seatRow'), col: int(p, 'seatCol') };
        const target = { row: int(p, 'outRow'), col: int(p, 'outCol') };
        const products = numbers(field(p, 'products'), 'products');
        return {
          ...scene,
          outputs: scene.outputs.map((r) => [...r]),
          seat,
          target,
          products,
          sum: null,
          written: null,
          step: {
            kind: 'seat',
            seat,
            from: scene.seat === null ? null : { ...scene.seat },
            target,
            count: products.length,
          },
        };
      }
      case 'write': {
        const target = { row: int(p, 'outRow'), col: int(p, 'outCol') };
        const sum = int(p, 'sum');
        const outputs = scene.outputs.map((r) => [...r]);
        const row = outputs[target.row];
        if (row === undefined || target.col < 0 || target.col >= row.length) {
          throw new Error(`slide-the-kernel 장면: 출력 칸 (${target.row}, ${target.col}) 이 격자 밖이다`);
        }
        row[target.col] = sum;
        return {
          ...scene,
          outputs,
          products: scene.products === null ? null : [...scene.products],
          sum,
          written: target,
          step: { kind: 'write', target, sum, filled: int(p, 'filled'), total: int(p, 'total') },
        };
      }
      default:
        throw new Error(`slide-the-kernel 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
