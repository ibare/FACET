/**
 * window-slides 의 장면.
 *
 * - 바탕 — 표 · 열 · 틀의 크기 · SQL 줄. `initial()` 이 `initialData` 에서 베낀다 (걸음 0)
 * - 자취 — 줄마다 near 칸. 틀이 지나간 줄은 값이 남는다
 * - 이번 걸음 — 틀이 머무는 줄과 틀 안의 줄. `from` 은 틀이 떠나온 줄 (처음이면 null)
 *
 * 셈(틀 자르기 · 합)은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type WindowSlidesBase = {
  table: string;
  columns: string[];
  rows: number[][];
  /** 차례 열의 자리 — 캡션이 그 줄의 day 값을 말한다 */
  orderAt: number;
  /** 더할 열의 자리 — 틀 안에서 near 칸으로 모이는 칸 */
  sumAt: number;
  alias: string;
  preceding: number;
  following: number;
  sql: string[];
};

export type WindowSlidesStep =
  | { kind: 'start' }
  | { kind: 'frame'; row: number; lo: number; hi: number; cut: boolean; from: number | null };

export type WindowSlidesScene = {
  base: WindowSlidesBase;
  near: Array<number | null>;
  step: WindowSlidesStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function needString(d: Record<string, unknown>, key: string): string {
  const v = d[key];
  if (typeof v !== 'string') throw new Error(`window-slides: initialData.${key} 가 글자가 아니다`);
  return v;
}

function needCount(d: Record<string, unknown>, key: string): number {
  const v = d[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`window-slides: initialData.${key} 가 0 이상 정수가 아니다`);
  }
  return v;
}

function needStrings(d: Record<string, unknown>, key: string): string[] {
  const v = d[key];
  if (!Array.isArray(v) || !v.every((s): s is string => typeof s === 'string')) {
    throw new Error(`window-slides: initialData.${key} 가 글자 목록이 아니다`);
  }
  return [...v];
}

function needRows(d: Record<string, unknown>, width: number): number[][] {
  const v = d.rows;
  if (!Array.isArray(v)) throw new Error('window-slides: initialData.rows 가 목록이 아니다');
  return v.map((r, i) => {
    if (!Array.isArray(r) || r.length !== width || !r.every((x): x is number => typeof x === 'number')) {
      throw new Error(`window-slides: initialData.rows[${i}] 가 수 ${width} 칸이 아니다`);
    }
    return [...r];
  });
}

function needNumber(v: unknown, key: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`window-slides: frame.${key} 가 정수가 아니다`);
  return v;
}

export const windowSlidesScene: ScenePlan<WindowSlidesScene> = {
  initial(initialData: unknown): WindowSlidesScene {
    if (!isRecord(initialData)) throw new Error('window-slides: initialData 가 없다');
    const columns = needStrings(initialData, 'columns');
    const rows = needRows(initialData, columns.length);
    const sumOf = needString(initialData, 'sumOf');
    const sumAt = columns.indexOf(sumOf);
    if (sumAt < 0) throw new Error(`window-slides: 표에 열 '${sumOf}' 이 없다`);
    const orderBy = needString(initialData, 'orderBy');
    const orderAt = columns.indexOf(orderBy);
    if (orderAt < 0) throw new Error(`window-slides: 표에 열 '${orderBy}' 이 없다`);
    return {
      base: {
        table: needString(initialData, 'table'),
        columns,
        rows,
        orderAt,
        sumAt,
        alias: needString(initialData, 'alias'),
        preceding: needCount(initialData, 'preceding'),
        following: needCount(initialData, 'following'),
        sql: needStrings(initialData, 'sql'),
      },
      near: rows.map(() => null),
      step: { kind: 'start' },
    };
  },

  reduce(scene: WindowSlidesScene, event: FacetRuntimeEvent): WindowSlidesScene {
    if (event.type !== 'frame') return scene;
    const p = event.payload;
    if (!isRecord(p)) throw new Error('window-slides: frame 의 payload 가 없다');
    const row = needNumber(p.row, 'row');
    const lo = needNumber(p.lo, 'lo');
    const hi = needNumber(p.hi, 'hi');
    const near = needNumber(p.near, 'near');
    if (typeof p.cut !== 'boolean') throw new Error('window-slides: frame.cut 가 참거짓이 아니다');
    const cut = p.cut;
    if (row < 0 || row >= scene.near.length) throw new Error(`window-slides: 없는 줄 ${row}`);
    const from = scene.step.kind === 'frame' ? scene.step.row : null;
    return {
      base: scene.base,
      near: scene.near.map((v, i) => (i === row ? near : v)),
      step: { kind: 'frame', row, lo, hi, cut, from },
    };
  },
};
