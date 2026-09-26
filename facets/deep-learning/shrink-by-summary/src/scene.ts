/**
 * shrinkBySummary 장면 — 바탕(특징 지도 · 창 · 출력 크기)과 자취(지나간 창들)와 이번 걸음.
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트를 이을 뿐이다 — 최댓값 · 그 자리 · 누계는
 * 이벤트가 실어 온 것을 그대로 옮긴다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type PooledCell = { row: number; col: number; value: number };

export type PoolWindow = {
  outRow: number;
  outCol: number;
  top: number;
  left: number;
  max: number;
  maxRow: number;
  maxCol: number;
  dropped: PooledCell[];
};

export type ShrinkStep =
  | { kind: 'start' }
  | {
      kind: 'pool';
      index: number;
      last: boolean;
      /** 창이 뛰어 온 자리. 첫 창이면 null */
      from: { top: number; left: number } | null;
    };

/** 바탕 — 알고리즘이 silent 인 pool-init 으로 한 번 정한다 */
export type ShrinkBase = {
  rows: number;
  cols: number;
  grid: number[][];
  k: number;
  stride: number;
  outRows: number;
  outCols: number;
  droppedTotal: number;
};

export type ShrinkScene = {
  /** pool-init 이 오기 전에는 null — 출력 크기는 알고리즘이 셈하므로 장면이 지어내지 않는다 */
  base: ShrinkBase | null;
  windows: PoolWindow[];
  kept: number;
  dropped: number;
  step: ShrinkStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`shrinkBySummaryScene: ${name} 이 수가 아니다`);
  return v;
}

function gridOf(v: unknown): number[][] {
  if (!Array.isArray(v)) throw new Error('shrinkBySummaryScene: grid 가 배열이 아니다');
  return v.map((row, r) => {
    if (!Array.isArray(row)) throw new Error(`shrinkBySummaryScene: grid ${r} 행이 배열이 아니다`);
    return row.map((x, c) => num(x, `grid (${r}, ${c})`));
  });
}

function cellOf(v: unknown): PooledCell {
  if (!isRecord(v)) throw new Error('shrinkBySummaryScene: 버린 칸의 꼴이 틀렸다');
  return { row: num(v.row, 'row'), col: num(v.col, 'col'), value: num(v.value, 'value') };
}

export const shrinkBySummaryScene: ScenePlan<ShrinkScene> = {
  initial(): ShrinkScene {
    // 바탕은 silent 인 pool-init 이 걸음 0 을 갈아 끼우며 채운다. 여기서 값을 지어내지 않는다
    return { base: null, windows: [], kept: 0, dropped: 0, step: { kind: 'start' } };
  },

  reduce(scene: ShrinkScene, event: FacetRuntimeEvent): ShrinkScene {
    const p = isRecord(event.payload) ? event.payload : null;
    if (event.type === 'pool-init') {
      if (!p) throw new Error('shrinkBySummaryScene: pool-init 에 payload 가 없다');
      return {
        base: {
          rows: num(p.rows, 'rows'),
          cols: num(p.cols, 'cols'),
          grid: gridOf(p.grid),
          k: num(p.k, 'k'),
          stride: num(p.stride, 'stride'),
          outRows: num(p.outRows, 'outRows'),
          outCols: num(p.outCols, 'outCols'),
          droppedTotal: num(p.droppedTotal, 'droppedTotal'),
        },
        windows: [],
        kept: 0,
        dropped: 0,
        step: { kind: 'start' },
      };
    }
    if (event.type === 'pool-window') {
      if (!p) throw new Error('shrinkBySummaryScene: pool-window 에 payload 가 없다');
      if (!scene.base) throw new Error('shrinkBySummaryScene: pool-init 보다 pool-window 가 먼저 왔다');
      if (!Array.isArray(p.droppedCells)) throw new Error('shrinkBySummaryScene: droppedCells 가 배열이 아니다');
      const win: PoolWindow = {
        outRow: num(p.outRow, 'outRow'),
        outCol: num(p.outCol, 'outCol'),
        top: num(p.top, 'top'),
        left: num(p.left, 'left'),
        max: num(p.max, 'max'),
        maxRow: num(p.maxRow, 'maxRow'),
        maxCol: num(p.maxCol, 'maxCol'),
        dropped: p.droppedCells.map(cellOf),
      };
      const before = scene.windows[scene.windows.length - 1];
      return {
        ...scene,
        windows: [...scene.windows, win],
        kept: num(p.kept, 'kept'),
        dropped: num(p.dropped, 'dropped'),
        step: {
          kind: 'pool',
          index: num(p.index, 'index'),
          last: p.last === true,
          from: before ? { top: before.top, left: before.left } : null,
        },
      };
    }
    throw new Error(`shrinkBySummaryScene: 모르는 이벤트 ${event.type}`);
  },
};
