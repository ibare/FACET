/**
 * bit-per-row — 비트맵 인덱스는 줄마다 무엇을 적어 두는가.
 *
 * 열 하나의 값마다 비트 줄 하나를 두고, 표의 줄을 차례로 옮기며 제 값의 비트 줄
 * 제 자리에 1, 다른 값의 비트 줄 같은 자리에 0 을 적는다.
 *
 * 이벤트
 * - `init` (silent) — 바탕. 비트 줄의 차례를 알린다.
 *     payload `{ values: string[] }` — 열에 나온 값의 바이트 사전순
 * - `row` — 줄 하나를 비트로 옮긴다. 걸음 1 … 10.
 *     payload `{ index: number; value: string; digits: string[] }`
 *     index 는 0 부터의 줄 자리(r1 = 0), digits 는 `values` 차례의 비트 줄마다
 *     이 자리에 적는 글자 `'0'` · `'1'`
 * - `done` — 끝. 걸음 11.
 *     payload `{ ones: number[]; total: number; bits: number; rows: number; values: number }`
 *     ones 는 `values` 차례의 비트 줄마다 1 의 수, total 은 그 합(= 줄 수), bits 는 적은 비트 모두
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BitPerRowFacetData = {
  type: 'bit-per-row';
  stepMs: number;
  /** 표 이름 (자료) */
  table: string;
  /** 열 이름 (자료) */
  column: string;
  /** 줄마다 그 열의 값. 첫 칸이 r1 */
  rows: string[];
};

/** 바이트 사전순 견줌 — 같은 값이면 0. */
function byteOrder(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** 열에 나온 값을 한 번씩, 바이트 사전순으로. */
export function distinctValues(rows: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const v of rows) seen.add(v);
  return [...seen].sort(byteOrder);
}

export async function bitPerRow(ctx: FacetContext<BitPerRowFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<BitPerRowFacetData>;
  const { rows, stepMs } = ctx.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('bit-per-row: 줄이 없다');
  }
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('bit-per-row: stepMs 가 양수가 아니다');
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const values = distinctValues(rows);
  await ctx.emit({ type: 'init', payload: { values }, silent: true });

  const ones = values.map(() => 0);
  for (let index = 0; index < rows.length; index += 1) {
    // 걸음 0 은 표와 빈 비트 줄 셋이 이미 선 화면이라 읽을 틈을 먼저 둔다.
    if (!(await pause())) return;
    const value = rows[index];
    if (typeof value !== 'string') {
      throw new Error(`bit-per-row: r${index + 1} 의 값이 글자가 아니다`);
    }
    const at = values.indexOf(value);
    if (at < 0) throw new Error(`bit-per-row: r${index + 1} 의 값 ${value} 에 비트 줄이 없다`);
    const digits = values.map((_, k) => (k === at ? '1' : '0'));
    const was = ones[at];
    if (was === undefined) throw new Error(`bit-per-row: 비트 줄 ${value} 의 수를 셀 자리가 없다`);
    ones[at] = was + 1;
    await ctx.emit({ type: 'row', payload: { index, value, digits } });
  }

  if (!(await pause())) return;
  // 줄마다 1 은 정확히 하나 — 1 의 수를 모두 더하면 줄 수와 같다.
  const total = ones.reduce((s, n) => s + n, 0);
  if (total !== rows.length) {
    throw new Error(`bit-per-row: 1 의 수 ${total} 이 줄 수 ${rows.length} 와 다르다`);
  }
  await ctx.emit({
    type: 'done',
    payload: { ones, total, bits: values.length * rows.length, rows: rows.length, values: values.length },
  });
}
