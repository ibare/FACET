/**
 * pascal-triangle 장면.
 *
 * 바탕: lastRow (마지막 줄 번호 — 자리 셈의 크기)
 * 자취: rows (지금까지 만든 줄들, 줄 0 부터)
 * 이번 걸음: step — 처음(start) 또는 줄 하나를 만든 걸음(row)
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowPascalTriangleData, type PascalSum } from './algorithm.js';

export type PascalStep =
  | { kind: 'start' }
  | { kind: 'row'; n: number; sums: PascalSum[]; top: number | null };

export type PascalTriangleScene = {
  lastRow: number;
  rows: number[][];
  step: PascalStep;
};

function asRecord(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`pascal-triangle 장면: ${path} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function asInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`pascal-triangle 장면: ${path} 가 정수가 아니다`);
  return v;
}

function asIntList(v: unknown, path: string): number[] {
  if (!Array.isArray(v)) throw new Error(`pascal-triangle 장면: ${path} 가 배열이 아니다`);
  return v.map((x, i) => asInt(x, `${path}[${i}]`));
}

export const pascalTriangleScene: ScenePlan<PascalTriangleScene> = {
  initial(initialData: unknown): PascalTriangleScene {
    const data = narrowPascalTriangleData(initialData);
    return { lastRow: data.lastRow, rows: [], step: { kind: 'start' } };
  },

  reduce(scene: PascalTriangleScene, event: FacetRuntimeEvent): PascalTriangleScene {
    switch (event.type) {
      case 'init': {
        const p = asRecord(event.payload, 'init.payload');
        const lastRow = asInt(p.lastRow, 'init.payload.lastRow');
        if (lastRow !== scene.lastRow) {
          throw new Error(`pascal-triangle 장면: init.payload.lastRow ${lastRow} 가 자료의 ${scene.lastRow} 와 다르다`);
        }
        const row = asIntList(p.row, 'init.payload.row');
        if (row.length !== 1) throw new Error('pascal-triangle 장면: init.payload.row 는 한 칸이어야 한다');
        return { lastRow, rows: [row], step: { kind: 'start' } };
      }
      case 'row': {
        const p = asRecord(event.payload, 'row.payload');
        const n = asInt(p.n, 'row.payload.n');
        if (n !== scene.rows.length) {
          throw new Error(`pascal-triangle 장면: row.payload.n ${n} 가 다음 줄 번호 ${scene.rows.length} 와 다르다`);
        }
        if (n > scene.lastRow) throw new Error(`pascal-triangle 장면: row.payload.n ${n} 가 마지막 줄을 넘는다`);
        const values = asIntList(p.values, 'row.payload.values');
        if (values.length !== n + 1) throw new Error(`pascal-triangle 장면: row.payload.values 가 ${n + 1} 칸이 아니다`);
        const above = scene.rows[n - 1];
        if (above === undefined) throw new Error(`pascal-triangle 장면: 줄 ${n - 1} 이 없다`);
        if (!Array.isArray(p.sums)) throw new Error('pascal-triangle 장면: row.payload.sums 가 배열이 아니다');
        const sums: PascalSum[] = p.sums.map((raw, i) => {
          const s = asRecord(raw, `row.payload.sums[${i}]`);
          const k = asInt(s.k, `row.payload.sums[${i}].k`);
          const a = asInt(s.a, `row.payload.sums[${i}].a`);
          const b = asInt(s.b, `row.payload.sums[${i}].b`);
          if (above[k - 1] !== a || above[k] !== b) {
            throw new Error(`pascal-triangle 장면: row.payload.sums[${i}] 의 a · b 가 줄 ${n - 1} 의 이웃과 다르다`);
          }
          if (values[k] !== a + b) {
            throw new Error(`pascal-triangle 장면: row.payload.values[${k}] 가 sums[${i}] 와 맞지 않는다`);
          }
          return { k, a, b };
        });
        let top: number | null;
        if (p.top === null) {
          top = null;
        } else {
          top = asInt(p.top, 'row.payload.top');
          if (!sums.some((s) => s.k === top)) {
            throw new Error(`pascal-triangle 장면: row.payload.top ${top} 가 안쪽 칸이 아니다`);
          }
        }
        return {
          lastRow: scene.lastRow,
          rows: [...scene.rows.map((r) => [...r]), values],
          step: { kind: 'row', n, sums, top },
        };
      }
      default:
        throw new Error(`pascal-triangle 장면: 모르는 이벤트 '${event.type}'`);
    }
  },
};
