/**
 * keep-unmatched — LEFT JOIN 은 짝이 없는 왼쪽 줄을 어떻게 하는가.
 *
 * 알고리즘은 SQL 을 파싱하지 않는다. 화면의 SQL 글자는 보이기용이고, 조인은 구조
 * (`left` · `right` 표, `on` 의 두 열, `select` 목록)에서 셈한다. 걸음은 줄 단위가 아니라
 * **무리 단위**다 — 짝 있는 줄 전부 → 짝 없는 줄 전부 → 그 줄들이 NULL 을 달고 남는다.
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (두 표와 SQL). 읽을 것이 이미
 * 있는 화면이라 첫 발신 앞에도 `stepMs` 를 둔다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *
 *   join-matched     { pairs: { left: number; right: number }[] }
 *     짝이 맞는 줄들이 한꺼번에 이어진다. left · right 는 두 표의 줄 번호(0 부터),
 *     왼쪽 표의 줄 차례로 늘어선다. 여기까지는 INNER JOIN 과 같다.
 *
 *   find-unmatched   { left: number[] }
 *     오른쪽 표에 짝이 없는 왼쪽 줄 번호들 (왼쪽 표의 줄 차례).
 *
 *   keep-unmatched   { rows: { left: number; right: number | null }[] }
 *     LEFT JOIN 의 결과 줄 전부, 왼쪽 표의 줄 차례. `right: null` 은 짝이 없는 줄이며
 *     그 줄의 오른쪽 칸은 NULL 이다 — 짝 없음을 NULL 로 바꾸는 자리는 이 한 곳뿐이다.
 *
 * 규약: 왼쪽 줄 하나에 오른쪽 짝은 많아야 하나 (한 줄이 여러 번 붙는 것은 이 조각의 말이
 * 아니다). 둘 이상이면 던진다. 모르는 열 이름도 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 칸 값. NULL 은 값이 아니라 결과 줄의 `right: null` 로만 생긴다. */
export type Cell = string | number;

export type SqlTable = {
  /** 표 이름 (SQL 식별자 — 번역하지 않는다) */
  name: string;
  columns: string[];
  /** 사양이 적은 줄 차례 그대로 */
  rows: Cell[][];
};

export type KeepUnmatchedFacetData = {
  type: 'keep-unmatched';
  stepMs: number;
  /** 화면에 보일 SQL 글자, 한 칸이 한 줄 */
  sql: string[];
  left: SqlTable;
  right: SqlTable;
  /** `ON right.<right> = left.<left>` 의 두 열 */
  on: { left: string; right: string };
  /** SELECT 목록 — 결과 칸이 어느 표의 어느 열에서 오는가 */
  select: { side: 'left' | 'right'; column: string }[];
};

/** 표에서 열 이름의 자리를 찾는다. 없으면 던진다 (C6). */
export function columnIndex(table: SqlTable, column: string): number {
  const at = table.columns.indexOf(column);
  if (at < 0) throw new Error(`keep-unmatched: 표 ${table.name} 에 열 ${column} 이 없다`);
  return at;
}

export async function keepUnmatched(
  context: FacetContext<KeepUnmatchedFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<KeepUnmatchedFacetData>;
  const { left, right, on, stepMs } = ctx.data;
  const lk = columnIndex(left, on.left);
  const rk = columnIndex(right, on.right);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 왼쪽 줄마다 오른쪽 짝을 찾는다 — 짝은 많아야 하나
  const partner: (number | null)[] = [];
  for (let li = 0; li < left.rows.length; li += 1) {
    if (ctx.cancelled) return;
    const row = left.rows[li];
    if (row === undefined) throw new Error(`keep-unmatched: 왼쪽 줄 ${li} 이 없다`);
    const key = row[lk];
    if (key === undefined) throw new Error(`keep-unmatched: 왼쪽 줄 ${li} 에 ${on.left} 칸이 없다`);
    const found: number[] = [];
    for (let ri = 0; ri < right.rows.length; ri += 1) {
      if (ctx.cancelled) return;
      const other = right.rows[ri];
      if (other === undefined) throw new Error(`keep-unmatched: 오른쪽 줄 ${ri} 이 없다`);
      if (other[rk] === undefined) {
        throw new Error(`keep-unmatched: 오른쪽 줄 ${ri} 에 ${on.right} 칸이 없다`);
      }
      if (other[rk] === key) found.push(ri);
    }
    if (found.length > 1) {
      throw new Error(`keep-unmatched: 왼쪽 줄 ${li} 의 짝이 ${found.length} 개 — 짝은 많아야 하나`);
    }
    const only = found[0];
    partner.push(only === undefined ? null : only);
  }

  const pairs: { left: number; right: number }[] = [];
  const unmatched: number[] = [];
  for (let li = 0; li < partner.length; li += 1) {
    if (ctx.cancelled) return;
    const ri = partner[li];
    if (ri === undefined) throw new Error(`keep-unmatched: 줄 ${li} 의 짝 기록이 없다`);
    if (ri === null) unmatched.push(li);
    else pairs.push({ left: li, right: ri });
  }

  // 걸음 0 (두 표와 SQL) 을 읽을 틈
  if (!(await pause())) return;
  await ctx.emit({ type: 'join-matched', payload: { pairs } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'find-unmatched', payload: { left: unmatched } });

  if (!(await pause())) return;
  // LEFT JOIN 규약: 짝이 없는 왼쪽 줄도 결과에 남고, 오른쪽 칸은 NULL 이다
  const rows = partner.map((ri, li) => ({ left: li, right: ri }));
  await ctx.emit({ type: 'keep-unmatched', payload: { rows } });
}
