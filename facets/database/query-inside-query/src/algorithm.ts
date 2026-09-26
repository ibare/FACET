/**
 * 괄호 안 질의가 먼저 돌아 값 하나가 되고, 그 값이 바깥 WHERE 속 괄호 자리에 들어앉은 뒤에야
 * 바깥 질의가 줄을 거른다 (비상관 스칼라 서브쿼리).
 *
 * SQL 글자는 보이기용 자료다 — 알고리즘은 그것을 파싱하지 않고, `inner` · `outer` 구조에서 셈한다.
 *
 * 이벤트 (셋 다 silent 아님 — 한 걸음씩):
 *   - `inner-run`  { values: number[]; total: number; count: number; value: number }
 *       안쪽 질의가 한 번 돈다. values 는 표 차례의 집계 열 값, value = total ÷ count (나누어떨어져야 한다)
 *   - `substitute` { value: number }
 *       안쪽 질의의 답이 괄호 자리에 들어간다
 *   - `filter`     { verdicts: boolean[]; kept: number }
 *       바깥 판정. verdicts 는 표 차례로 줄마다 남는가, kept 는 남은 줄 수
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (표와 SQL). 읽을 것이 있는 화면이라
 * 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type QueryCell = string | number;

export type QueryInsideQueryFacetData = {
  type: 'query-inside-query';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 표 이름 (SQL 식별자 — 자료) */
  table: string;
  /** 열 이름 (SQL 식별자 — 자료) */
  columns: string[];
  /** 줄. 칸은 columns 차례 */
  rows: QueryCell[][];
  /** 안쪽 질의 — 표 전체를 값 하나로 줄인다 */
  inner: { agg: 'AVG'; column: string };
  /** 바깥 WHERE — `column op (안쪽 질의)` */
  outer: { column: string; op: '>' };
  /** 보이기용 SQL. 마지막 줄은 lead + inner + tail 로 이어 읽는다 */
  sql: { head: string[]; lead: string; inner: string; tail: string };
};

/** 열 이름의 자리. 없으면 던진다 (C6). */
export function columnIndex(columns: readonly string[], name: string): number {
  const at = columns.indexOf(name);
  if (at < 0) throw new Error(`query-inside-query: 표에 열 "${name}" 이 없다 (열: ${columns.join(', ')})`);
  return at;
}

function numberCell(row: readonly QueryCell[], at: number, rowNo: number): number {
  const v = row[at];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`query-inside-query: ${rowNo} 번째 줄의 ${at} 번째 칸이 정수가 아니다 (${String(v)})`);
  }
  return v;
}

export async function queryInsideQuery(context: FacetContext<QueryInsideQueryFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<QueryInsideQueryFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  if (data.inner.agg !== 'AVG') throw new Error(`query-inside-query: 모르는 집계 ${String(data.inner.agg)}`);
  if (data.outer.op !== '>') throw new Error(`query-inside-query: 모르는 비교 ${String(data.outer.op)}`);

  // 걸음 0 (표와 SQL) 을 읽을 틈
  if (!(await pause())) return;

  // 걸음 1 — 안쪽 질의가 한 번만 돈다. 바깥 줄과 무관하다
  const innerAt = columnIndex(data.columns, data.inner.column);
  const values = data.rows.map((row, i) => numberCell(row, innerAt, i + 1));
  const count = values.length;
  if (count === 0) throw new Error('query-inside-query: 줄이 없어 AVG 를 셈할 수 없다');
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total % count !== 0) {
    throw new Error(`query-inside-query: AVG ${total} ÷ ${count} 가 나누어떨어지지 않는다 — 정수 표시 규약 밖`);
  }
  const value = total / count;
  await ctx.emit({ type: 'inner-run', payload: { values, total, count, value } });
  if (!(await pause())) return;

  // 걸음 2 — 그 값이 괄호 자리에 들어간다
  await ctx.emit({ type: 'substitute', payload: { value } });
  if (!(await pause())) return;

  // 걸음 3 — 이제야 바깥이 줄을 거른다 (엄격 >)
  const outerAt = columnIndex(data.columns, data.outer.column);
  const verdicts = data.rows.map((row, i) => numberCell(row, outerAt, i + 1) > value);
  const kept = verdicts.filter(Boolean).length;
  await ctx.emit({ type: 'filter', payload: { verdicts, kept } });
}
