/**
 * slide-the-kernel — 3×3 창이 입력 위를 밀려 가며 겹쳐 곱하고, 곱의 합이 출력 칸을 채운다.
 *
 * 모형: 교차 상관(창을 뒤집지 않는다) · 편향 없음 · 보폭 1 · 패딩 없음 · 채널 하나.
 * 출력 (r, c) = Σᵢ Σⱼ 입력[r + i][c + j] × 창[i][j]. 창이 앉는 차례는 행 우선.
 *
 * 이벤트:
 *   - init  (silent: true)
 *       payload: { input: number[][]; kernel: number[][]; outRows: number; outCols: number }
 *       바탕 — 입력 격자 · 창 · 알고리즘이 셈한 출력 크기. 걸음 0 을 채운다.
 *   - seat
 *       payload: { seatRow: number; seatCol: number; outRow: number; outCol: number; products: number[] }
 *       창이 입력의 (seatRow, seatCol) 에 앉았다. products 는 겹친 아홉 쌍의 곱을
 *       창의 행 우선 차례로 담는다. (outRow, outCol) 은 이 자리가 채울 출력 칸.
 *   - write
 *       payload: { outRow: number; outCol: number; sum: number; filled: number; total: number }
 *       곱의 합 sum 이 출력 칸에 적혔다. filled 는 지금까지 찬 출력 칸 수, total 은 출력 칸 전부.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SlideTheKernelFacetData = {
  type: 'slide-the-kernel';
  stepMs: number;
  input: number[][];
  kernel: number[][];
};

/** 격자가 비지 않고 행 길이가 같으며 칸이 모두 유한한 수인지 본다. 아니면 던진다. */
export function checkGrid(grid: unknown, name: string): number[][] {
  if (!Array.isArray(grid) || grid.length === 0) {
    throw new Error(`slide-the-kernel: ${name} 격자가 비었거나 배열이 아니다`);
  }
  const rows: number[][] = [];
  let width = -1;
  grid.forEach((row: unknown, r) => {
    if (!Array.isArray(row) || row.length === 0) {
      throw new Error(`slide-the-kernel: ${name} 의 행 ${r} 이 비었거나 배열이 아니다`);
    }
    if (width === -1) width = row.length;
    if (row.length !== width) {
      throw new Error(`slide-the-kernel: ${name} 의 행 ${r} 길이 ${row.length} 가 ${width} 와 다르다`);
    }
    rows.push(
      row.map((v: unknown, c) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          throw new Error(`slide-the-kernel: ${name} 의 칸 (${r}, ${c}) 이 수가 아니다`);
        }
        return v;
      }),
    );
  });
  return rows;
}

/** 격자의 열 수. 빈 격자면 던진다. */
export function widthOf(grid: number[][], name: string): number {
  const first = grid[0];
  if (first === undefined) throw new Error(`slide-the-kernel: ${name} 격자가 비었다`);
  return first.length;
}

/** 출력 크기 ⌊(n + 2p − k) / s⌋ + 1 — 이 조각은 p = 0 · s = 1. 창이 입력보다 크면 던진다. */
export function outputSize(n: number, k: number): number {
  if (k > n) throw new Error(`slide-the-kernel: 창 ${k} 이 입력 ${n} 보다 크다`);
  return n - k + 1;
}

/** 창이 (seatRow, seatCol) 에 앉을 때 겹친 쌍의 곱 — 창의 행 우선 차례. */
export function productsAt(
  input: number[][],
  kernel: number[][],
  seatRow: number,
  seatCol: number,
): number[] {
  const out: number[] = [];
  kernel.forEach((wRow, i) => {
    const inRow = input[seatRow + i];
    if (inRow === undefined) throw new Error(`slide-the-kernel: 입력 행 ${seatRow + i} 이 격자 밖이다`);
    wRow.forEach((w, j) => {
      const x = inRow[seatCol + j];
      if (x === undefined) throw new Error(`slide-the-kernel: 입력 칸 (${seatRow + i}, ${seatCol + j}) 이 격자 밖이다`);
      const p = x * w;
      out.push(p === 0 ? 0 : p);
    });
  });
  return out;
}

export async function slideTheKernel(ctx: FacetContext<SlideTheKernelFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SlideTheKernelFacetData>;
  const data: unknown = rctx.data;
  if (typeof data !== 'object' || data === null) {
    throw new Error('slide-the-kernel: initialData 가 객체가 아니다');
  }
  const rawStepMs: unknown = (data as Record<string, unknown>).stepMs;
  if (typeof rawStepMs !== 'number' || !Number.isFinite(rawStepMs) || rawStepMs < 0) {
    throw new Error('slide-the-kernel: stepMs 가 0 이상의 수가 아니다');
  }
  const stepMs: number = rawStepMs;
  const input = checkGrid(rctx.data.input, 'input');
  const kernel = checkGrid(rctx.data.kernel, 'kernel');
  const outRows = outputSize(input.length, kernel.length);
  const outCols = outputSize(widthOf(input, 'input'), widthOf(kernel, 'kernel'));
  const total = outRows * outCols;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  await rctx.emit({
    type: 'init',
    silent: true,
    payload: { input: input.map((r) => [...r]), kernel: kernel.map((r) => [...r]), outRows, outCols },
  });

  let filled = 0;
  for (let outRow = 0; outRow < outRows; outRow += 1) {
    if (rctx.cancelled) return;
    for (let outCol = 0; outCol < outCols; outCol += 1) {
      // 걸음 0 은 입력 · 창 · 빈 출력이 이미 읽을 것이라 첫 자리 앞에도 머문다
      if (!(await pause())) return;
      const seatRow = outRow;
      const seatCol = outCol;
      const products = productsAt(input, kernel, seatRow, seatCol);
      await rctx.emit({ type: 'seat', payload: { seatRow, seatCol, outRow, outCol, products } });

      if (!(await pause())) return;
      const sum = products.reduce((a, b) => a + b, 0);
      filled += 1;
      await rctx.emit({ type: 'write', payload: { outRow, outCol, sum: sum === 0 ? 0 : sum, filled, total } });
    }
  }
}
