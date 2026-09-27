/**
 * pascal-triangle — 파스칼 삼각형의 한 줄은 바로 위 줄에서 어떻게 만들어지는가.
 *
 * 줄 0 은 `1` 한 칸이다. 줄 n 의 k 번째는 줄 n−1 의 (k−1) 번째와 k 번째를 더한 것이고,
 * 위 줄 바깥은 0 으로 본다 — 그래서 양 끝은 0 + 1 = 1 이다. 걸음 n 이 줄 n 을 만들고,
 * 한 걸음 안의 안쪽 덧셈은 한꺼번에 일어난다.
 *
 * 이벤트:
 *   init  (silent) payload { lastRow: number; row: number[] }
 *         걸음 0 의 바탕 — 마지막 줄 번호와 줄 0 (`[1]`).
 *   row   payload { n: number; values: number[];
 *                   sums: { k: number; a: number; b: number }[];
 *                   top: number | null }
 *         줄 n 을 만든다. values 는 줄 n 의 수 (n + 1 칸).
 *         sums 는 안쪽 칸(위에 수가 둘인 칸)마다 k 와 위 왼쪽 수 a · 위 오른쪽 수 b.
 *         top 은 가장 큰 수가 처음 나오는 안쪽 칸의 k — 안쪽 칸이 없으면 null.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PascalTriangleFacetData = {
  type: 'pascal-triangle';
  /** 마지막 줄 번호 (줄 0 부터) */
  lastRow: number;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

export type PascalSum = { k: number; a: number; b: number };

/** 자료를 좁힌다. 모양이 어긋나면 필드 경로를 담아 던진다. */
export function narrowPascalTriangleData(raw: unknown): PascalTriangleFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('pascal-triangle: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'pascal-triangle') {
    throw new Error(`pascal-triangle: initialData.type 이 'pascal-triangle' 이 아니다 (${String(r.type)})`);
  }
  const lastRow = r.lastRow;
  if (typeof lastRow !== 'number' || !Number.isInteger(lastRow) || lastRow < 1) {
    throw new Error('pascal-triangle: initialData.lastRow 는 1 이상의 정수여야 한다');
  }
  const stepMs = r.stepMs;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs < 0) {
    throw new Error('pascal-triangle: initialData.stepMs 는 0 이상의 수여야 한다');
  }
  return { type: 'pascal-triangle', lastRow, stepMs };
}

/** 위 줄 바깥을 0 으로 보고 위 둘을 더해 다음 줄을 만든다. */
export function nextRow(above: readonly number[]): number[] {
  const out: number[] = [];
  for (let k = 0; k <= above.length; k += 1) {
    const left = k - 1 >= 0 ? above[k - 1] : 0;
    const right = k < above.length ? above[k] : 0;
    if (left === undefined || right === undefined) {
      throw new Error(`pascal-triangle: 위 줄 ${k} 번째 칸이 없다`);
    }
    out.push(left + right);
  }
  return out;
}

export async function pascalTriangle(ctx: FacetContext<PascalTriangleFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<PascalTriangleFacetData>;
  const data = narrowPascalTriangleData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  let above: number[] = [1];
  await ctx.emit({ type: 'init', silent: true, payload: { lastRow: data.lastRow, row: [...above] } });

  for (let n = 1; n <= data.lastRow; n += 1) {
    if (!(await pause())) return;
    const values = nextRow(above);
    const sums: PascalSum[] = [];
    for (let k = 1; k < n; k += 1) {
      if (ctx.cancelled) return;
      const a = above[k - 1];
      const b = above[k];
      if (a === undefined || b === undefined) {
        throw new Error(`pascal-triangle: 줄 ${n - 1} 의 ${k} 번째 이웃이 없다`);
      }
      sums.push({ k, a, b });
    }
    let top: number | null = null;
    let best = -1;
    for (const s of sums) {
      if (ctx.cancelled) return;
      if (s.a + s.b > best) {
        best = s.a + s.b;
        top = s.k;
      }
    }
    await ctx.emit({ type: 'row', payload: { n, values, sums, top } });
    above = values;
  }
}
