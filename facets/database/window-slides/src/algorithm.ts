/**
 * window-slides — 틀이 줄을 따라 미끄러지고, 틀 안의 합이 그 줄 자신의 칸에 적힌다.
 *
 * `SUM(amount) OVER (ORDER BY day ROWS BETWEEN p PRECEDING AND f FOLLOWING)` 를 셈한다.
 * SQL 글자는 파싱하지 않는다 — 틀의 크기(`preceding` · `following`) · 차례 열 · 더할 열은
 * `initialData` 의 구조다. 틀은 **줄 차례로** 앞 p 줄 · 뒤 f 줄이고, 표 밖은 없는 줄이라
 * 끝에서 틀이 준다 (0 으로 채우지 않는다).
 *
 * 걸음 0 은 장면의 `initial()` 이 채운다 (표 · SQL · 빈 near 칸). 첫 발신 앞에 `stepMs`
 * 를 두어 그 화면을 읽을 틈을 준다.
 *
 * 이벤트 (모두 silent 아님):
 *   - `frame` — 틀이 한 줄에 머문다. 줄 차례로 한 번씩.
 *       payload: {
 *         row: number   // 틀이 머무는 줄 (표의 줄 번호, 0 부터)
 *         lo: number    // 틀 안 첫 줄 (표 밖은 잘려 있다)
 *         hi: number    // 틀 안 끝 줄
 *         near: number  // 틀 안 더할 열의 합 — 그 줄의 near 칸에 적힌다
 *         cut: boolean  // 틀이 표 밖으로 나가 잘렸는가 (양 끝)
 *       }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WindowSlidesFacetData = {
  type: 'window-slides';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 표 이름 (SQL 식별자, 자료) */
  table: string;
  /** 표의 열 이름 (자료) */
  columns: string[];
  /** 표의 줄 — 열 차례대로 정수 */
  rows: number[][];
  /** `ORDER BY` 의 열 */
  orderBy: string;
  /** `SUM(...)` 의 열 */
  sumOf: string;
  /** 틀 — 현재 줄 앞 몇 줄 */
  preceding: number;
  /** 틀 — 현재 줄 뒤 몇 줄 */
  following: number;
  /** 결과 열의 별칭 (`AS near`) */
  alias: string;
  /** 화면에 보이는 SQL 줄 (보이기용 자료) */
  sql: string[];
};

/** 열 이름의 자리. 없으면 던진다 — 모르는 열로 셈하지 않는다. */
function columnAt(columns: readonly string[], name: string): number {
  const at = columns.indexOf(name);
  if (at < 0) throw new Error(`window-slides: 표에 열 '${name}' 이 없다 (열: ${columns.join(', ')})`);
  return at;
}

/** 틀 안 첫 줄 · 끝 줄 — 줄 차례로 앞 p · 뒤 f, 표 밖은 자른다. */
function frameOf(
  row: number,
  count: number,
  preceding: number,
  following: number,
): { lo: number; hi: number; cut: boolean } {
  const first = row - preceding;
  const last = row + following;
  return { lo: Math.max(0, first), hi: Math.min(count - 1, last), cut: first < 0 || last > count - 1 };
}

export async function windowSlides(context: FacetContext<WindowSlidesFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<WindowSlidesFacetData>;
  const data = ctx.data;
  const { rows, stepMs } = data;

  if (rows.length === 0) throw new Error('window-slides: 표에 줄이 없다');
  if (!Number.isInteger(data.preceding) || data.preceding < 0) {
    throw new Error(`window-slides: preceding 이 0 이상 정수가 아니다 (${data.preceding})`);
  }
  if (!Number.isInteger(data.following) || data.following < 0) {
    throw new Error(`window-slides: following 이 0 이상 정수가 아니다 (${data.following})`);
  }
  const orderAt = columnAt(data.columns, data.orderBy);
  const sumAt = columnAt(data.columns, data.sumOf);

  rows.forEach((r, i) => {
    if (r.length !== data.columns.length) {
      throw new Error(`window-slides: ${i} 번 줄의 칸 수 ${r.length} 가 열 수 ${data.columns.length} 와 다르다`);
    }
    for (const v of r) {
      if (!Number.isInteger(v)) throw new Error(`window-slides: ${i} 번 줄에 정수가 아닌 값 (${v})`);
    }
  });
  // 틀은 ORDER BY 차례로 미끄러진다. 화면은 표의 줄 차례로 그리므로 둘이 같아야 한다.
  for (let i = 1; i < rows.length; i += 1) {
    const before = rows[i - 1]![orderAt]!;
    const here = rows[i]![orderAt]!;
    if (!(before < here)) {
      throw new Error(`window-slides: 줄이 ${data.orderBy} 차례가 아니다 (${i} 번 줄 ${here} ≤ ${before})`);
    }
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (let row = 0; row < rows.length; row += 1) {
    if (!(await pause())) return;
    const { lo, hi, cut } = frameOf(row, rows.length, data.preceding, data.following);
    let near = 0;
    for (let k = lo; k <= hi; k += 1) {
      if (ctx.cancelled) return;
      near += rows[k]![sumAt]!;
    }
    await ctx.emit({ type: 'frame', payload: { row, lo, hi, near, cut } });
  }
}
