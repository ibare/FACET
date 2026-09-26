/**
 * shrinkBySummary — 최댓값 풀링. 2×2 창이 겹치지 않고 두 칸씩 옮겨 가며, 창 안 네 수
 * 가운데 가장 큰 하나만 줄어든 지도로 올리고 나머지 셋은 버린다.
 *
 * 곱하지 않는다 — 고르기만 한다. 배우는 무게가 없다.
 *
 * 이벤트
 *   pool-init  silent  { rows: number; cols: number; grid: number[][]; k: number; stride: number;
 *                        outRows: number; outCols: number; droppedTotal: number }
 *                      바탕. 출력 크기 ⌊(n − k) / s⌋ + 1 과 버려질 칸의 총수를 셈해 싣는다
 *   pool-window        { index: number; outRow: number; outCol: number; top: number; left: number;
 *                        values: number[]; max: number; maxRow: number; maxCol: number;
 *                        kept: number; dropped: number;
 *                        droppedCells: { row: number; col: number; value: number }[];
 *                        last: boolean }
 *                      창 하나. values 는 창 안 네 수(행 우선), kept · dropped 는 지금까지의 누계
 *
 * 걸음: 처음 화면(걸음 0) 뒤 창마다 한 걸음. 모형 — 교차 상관 없음 · 패딩 없음 · 채널 하나.
 * 창 안 최댓값의 동률은 어느 쪽을 남길지 규약이 없으므로 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ShrinkBySummaryFacetData = {
  type: 'shrink-by-summary';
  /** 특징 지도 — 행마다의 수 */
  grid: number[][];
  /** 풀링 창 한 변 */
  window: number;
  /** 보폭 */
  stride: number;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

export type DroppedCell = { row: number; col: number; value: number };

/** 출력 한 변의 크기 ⌊(n − k) / s⌋ + 1 (패딩 없음). */
export function poolOutSize(n: number, k: number, stride: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || !Number.isInteger(stride)) {
    throw new Error(`shrinkBySummary: 크기는 정수여야 한다 — n=${n}, k=${k}, s=${stride}`);
  }
  if (k < 1 || stride < 1) throw new Error(`shrinkBySummary: 창 ${k} · 보폭 ${stride} 은 1 이상이어야 한다`);
  if (n < k) throw new Error(`shrinkBySummary: 입력 한 변 ${n} 이 창 ${k} 보다 작다`);
  return Math.floor((n - k) / stride) + 1;
}

/** 출력 칸 (outRow, outCol) 에 대응하는 창 왼위의 입력 좌표. */
export function windowOrigin(outRow: number, outCol: number, stride: number): { top: number; left: number } {
  return { top: outRow * stride, left: outCol * stride };
}

function checkGrid(grid: unknown): number[][] {
  if (!Array.isArray(grid) || grid.length === 0) throw new Error('shrinkBySummary: grid 가 비었다');
  const width = Array.isArray(grid[0]) ? grid[0].length : -1;
  if (width <= 0) throw new Error('shrinkBySummary: grid 의 0 행이 비었다');
  return grid.map((row, r) => {
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error(`shrinkBySummary: grid ${r} 행의 길이가 ${width} 가 아니다`);
    }
    return row.map((v, c) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(`shrinkBySummary: grid (${r}, ${c}) 가 수가 아니다`);
      }
      return v;
    });
  });
}

function checkCount(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new Error(`shrinkBySummary: ${name} 는 1 이상의 정수여야 한다 — 받은 값 ${String(v)}`);
  }
  return v;
}

/** ctx.data 좁히개 — 모양이 어긋나면 던진다. */
export function narrowShrinkData(data: unknown): ShrinkBySummaryFacetData {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('shrinkBySummary: 자료가 객체가 아니다');
  }
  const d = data as Record<string, unknown>;
  if (d.type !== 'shrink-by-summary') {
    throw new Error(`shrinkBySummary: 자료의 type 이 shrink-by-summary 가 아니다 — ${String(d.type)}`);
  }
  if (typeof d.stepMs !== 'number' || !Number.isFinite(d.stepMs) || d.stepMs < 0) {
    throw new Error(`shrinkBySummary: stepMs 가 0 이상의 수가 아니다 — ${String(d.stepMs)}`);
  }
  return {
    type: 'shrink-by-summary',
    grid: checkGrid(d.grid),
    window: checkCount(d.window, 'window'),
    stride: checkCount(d.stride, 'stride'),
    stepMs: d.stepMs,
  };
}

export async function shrinkBySummary(context: FacetContext<ShrinkBySummaryFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ShrinkBySummaryFacetData>;
  const data = narrowShrinkData(ctx.data);
  const grid = data.grid;
  const k = data.window;
  const stride = data.stride;
  const stepMs = data.stepMs;
  const rows = grid.length;
  const cols = grid[0]!.length;
  const outRows = poolOutSize(rows, k, stride);
  const outCols = poolOutSize(cols, k, stride);
  const windowCount = outRows * outCols;
  const droppedTotal = windowCount * (k * k - 1);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'pool-init',
    silent: true,
    payload: {
      rows,
      cols,
      grid: grid.map((row) => [...row]),
      k,
      stride,
      outRows,
      outCols,
      droppedTotal,
    },
  });

  let kept = 0;
  let dropped = 0;
  for (let index = 0; index < windowCount; index += 1) {
    if (!(await pause())) return;
    const outRow = Math.floor(index / outCols);
    const outCol = index % outCols;
    const { top, left } = windowOrigin(outRow, outCol, stride);

    const cells: DroppedCell[] = [];
    for (let i = 0; i < k; i += 1) {
      for (let j = 0; j < k; j += 1) {
        const row = top + i;
        const col = left + j;
        const value = grid[row]?.[col];
        if (value === undefined) throw new Error(`shrinkBySummary: 창 칸 (${row}, ${col}) 이 격자 밖이다`);
        cells.push({ row, col, value });
      }
    }

    let best = cells[0]!;
    for (const cell of cells) if (cell.value > best.value) best = cell;
    const ties = cells.filter((cell) => cell.value === best.value).length;
    if (ties > 1) {
      throw new Error(`shrinkBySummary: 창 (${top}, ${left}) 의 최댓값 ${best.value} 이 동률 ${ties} 칸이다`);
    }
    const droppedCells = cells.filter((cell) => cell !== best);
    kept += 1;
    dropped += droppedCells.length;

    await ctx.emit({
      type: 'pool-window',
      payload: {
        index,
        outRow,
        outCol,
        top,
        left,
        values: cells.map((cell) => cell.value),
        max: best.value,
        maxRow: best.row,
        maxCol: best.col,
        kept,
        dropped,
        droppedCells,
        last: index === windowCount - 1,
      },
    });
  }
}
