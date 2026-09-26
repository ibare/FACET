/**
 * 보폭과 패딩 — 입력 둘레에 0 을 두르고, 창을 보폭만큼 뛰게 해 출력을 채운다.
 *
 * 합성곱은 교차 상관이다 (창을 뒤집지 않는다). 편향 · 활성 함수 없음, 채널 하나.
 * 좌표는 두른 격자 기준 (행, 열) · 0 부터. 창의 자리 = 창 왼위 칸. 앉는 차례는 행 우선.
 *
 * 이벤트 (걸음 0 의 입력 · 창은 장면의 initial() 이 initialData 에서 세운다)
 *
 *   size  (silent) 출력 크기를 바탕에 넣는다 — 걸음 0 을 갈아 끼운다.
 *     payload: {
 *       outRows: number       출력 행 수 = ⌊(행 + 2p − k) / s⌋ + 1
 *       outCols: number       출력 열 수
 *     }
 *
 *   pad   (silent 아님) 둘레에 0 을 두른다.
 *     payload: {
 *       grid: number[][]      두른 격자 (행 · 열 = n + 2p)
 *       added: number         두른 칸의 수
 *     }
 *
 *   seat  (silent 아님) 창이 한 자리에 앉고 출력 한 칸이 적힌다.
 *     payload: {
 *       r: number, c: number          창 왼위 (두른 격자 기준)
 *       from: { r, c } | null         바로 앞 자리 (첫 자리면 null)
 *       padCells: number              창 아홉 칸 가운데 두른 0 위에 놓인 칸의 수
 *       or: number, oc: number        출력 칸
 *       value: number                 출력 값 (Σ 두른격자[r+i][c+j] × 창[i][j])
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type StrideAndPaddingFacetData = {
  type: 'stride-and-padding';
  /** 두르기 전 입력 격자 (행마다). */
  input: number[][];
  /** 창의 무게 (정사각). */
  kernel: number[][];
  /** 패딩 두께 (네 변 같은 두께, 값 0). */
  padding: number;
  /** 보폭. */
  stride: number;
  /** 걸음 뒤 머무는 ms. */
  stepMs: number;
};

/** 격자의 (r, c) 값. 격자 밖이면 던진다 — 빈 칸을 지어내지 않는다. */
export function cellAt(grid: readonly (readonly number[])[], r: number, c: number): number {
  const row = grid[r];
  if (row === undefined) throw new Error(`행 ${r} 가 격자 밖이다`);
  const v = row[c];
  if (v === undefined) throw new Error(`(${r}, ${c}) 가 격자 밖이다`);
  return v;
}

/** 수 격자인지 확인하고 베낀다. 비었거나 행 길이가 다르거나 수가 아니면 던진다. */
export function narrowGrid(v: unknown, what: string): number[][] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`${what}: 비지 않은 배열이어야 한다`);
  const out: number[][] = [];
  let cols = -1;
  v.forEach((row: unknown, i) => {
    if (!Array.isArray(row) || row.length === 0) throw new Error(`${what}: 행 ${i} 가 비지 않은 배열이 아니다`);
    if (cols === -1) cols = row.length;
    if (row.length !== cols) throw new Error(`${what}: 행 ${i} 의 길이 ${row.length} 가 ${cols} 와 다르다`);
    out.push(
      row.map((x: unknown, j) => {
        if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`${what}: (${i}, ${j}) 가 수가 아니다`);
        return x;
      }),
    );
  });
  return out;
}

/** initialData 를 좁힌다. 모자라거나 틀리면 던진다. */
export function narrowData(d: unknown): StrideAndPaddingFacetData {
  if (typeof d !== 'object' || d === null) throw new Error('자료가 객체가 아니다');
  const o = d as Record<string, unknown>;
  if (o.type !== 'stride-and-padding') throw new Error(`자료 type 이 stride-and-padding 이 아니다: ${String(o.type)}`);
  const input = narrowGrid(o.input, '입력');
  const kernel = narrowGrid(o.kernel, '창');
  if (kernel.length !== cellRowLength(kernel)) throw new Error(`창이 정사각이 아니다`);
  const { padding, stride, stepMs } = o;
  if (typeof padding !== 'number' || !Number.isInteger(padding) || padding < 0) {
    throw new Error(`패딩은 0 이상의 정수여야 한다: ${String(padding)}`);
  }
  if (typeof stride !== 'number' || !Number.isInteger(stride) || stride < 1) {
    throw new Error(`보폭은 1 이상의 정수여야 한다: ${String(stride)}`);
  }
  if (typeof stepMs !== 'number' || !(stepMs >= 0)) throw new Error(`stepMs 가 0 이상의 수가 아니다: ${String(stepMs)}`);
  return { type: 'stride-and-padding', input, kernel, padding, stride, stepMs };
}

/** 좁힌 격자의 열 수. */
export function cellRowLength(grid: readonly (readonly number[])[]): number {
  const first = grid[0];
  if (first === undefined) throw new Error('빈 격자');
  return first.length;
}

/** 출력 한 축의 크기 = ⌊(n + 2p − k) / s⌋ + 1. 창이 두른 격자보다 크면 던진다. */
export function outputSize(n: number, p: number, k: number, s: number): number {
  if (n + 2 * p < k) throw new Error(`창 ${k} 가 두른 격자 ${n + 2 * p} 보다 크다`);
  return Math.floor((n + 2 * p - k) / s) + 1;
}

/** 두른 격자의 (r, c) 가 두른 칸인가. 격자 밖이면 던진다. */
export function isPadCell(r: number, c: number, rows: number, cols: number, p: number): boolean {
  if (r < 0 || c < 0 || r >= rows + 2 * p || c >= cols + 2 * p) {
    throw new Error(`(${r}, ${c}) 는 두른 격자 밖이다`);
  }
  return r < p || c < p || r >= rows + p || c >= cols + p;
}

/** 출력 칸 (or, oc) 에서 창 왼위의 좌표 (두른 격자 기준). */
export function seatOf(or: number, oc: number, s: number): [number, number] {
  return [or * s, oc * s];
}

/** 두른 격자를 명시적으로 만든다 — 둘레 p 겹은 0. */
function padGrid(input: number[][], p: number): number[][] {
  const rows = input.length;
  const cols = cellRowLength(input);
  const out: number[][] = [];
  for (let r = 0; r < rows + 2 * p; r += 1) {
    const row: number[] = [];
    for (let c = 0; c < cols + 2 * p; c += 1) {
      row.push(isPadCell(r, c, rows, cols, p) ? 0 : cellAt(input, r - p, c - p));
    }
    out.push(row);
  }
  return out;
}

export async function strideAndPadding(
  ctx0: FacetContext<StrideAndPaddingFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<StrideAndPaddingFacetData>;
  const { input, kernel, padding: p, stride: s, stepMs } = narrowData(ctx.data);

  const rows = input.length;
  const cols = cellRowLength(input);
  const k = kernel.length;
  const outRows = outputSize(rows, p, k, s);
  const outCols = outputSize(cols, p, k, s);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'size', payload: { outRows, outCols }, silent: true });

  // 걸음 0 은 두르기 전 입력이 이미 읽을 화면이라 첫 발신 앞에 읽을 틈을 둔다.
  if (!(await pause())) return;

  const grid = padGrid(input, p);
  const added = grid.length * cellRowLength(grid) - rows * cols;
  await ctx.emit({ type: 'pad', payload: { grid, added } });
  if (!(await pause())) return;

  let from: { r: number; c: number } | null = null;
  for (let or = 0; or < outRows; or += 1) {
    if (ctx.cancelled) return;
    for (let oc = 0; oc < outCols; oc += 1) {
      if (ctx.cancelled) return;
      const [r, c] = seatOf(or, oc, s);
      let value = 0;
      let padCells = 0;
      for (let i = 0; i < k; i += 1) {
        for (let j = 0; j < k; j += 1) {
          value += cellAt(grid, r + i, c + j) * cellAt(kernel, i, j);
          if (isPadCell(r + i, c + j, rows, cols, p)) padCells += 1;
        }
      }
      await ctx.emit({ type: 'seat', payload: { r, c, from, padCells, or, oc, value } });
      from = { r, c };
      if (!(await pause())) return;
    }
  }
}
