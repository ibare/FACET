/**
 * 줄은 사실이다 — 표의 한 줄은 무엇을 말하는가.
 *
 * 표 머리가 빈칸 달린 문장 틀이 되고, 줄마다 제 값이 그 빈칸을 채워 참인 문장 하나가
 * 된다. 이어 물음(값의 짝)이 표로 내려와 두 열이 모두 같은 줄을 찾는다 — 있으면 참,
 * 없으면 거짓이다 (닫힌 세계 가정. 전제는 설명 글이 밝힌다).
 *
 * 이벤트 (전부 silent 아님 — 한 걸음 = emit 하나):
 *   frame  payload: {}                         — 표 머리가 문장 틀이 된다
 *   fact   payload: { row: number }            — 줄 `row`(데이터 차례의 번호) 의 값이 틀을 채워 사실이 된다
 *   ask    payload: {
 *            query: number;                    — 물음 번호 (데이터 차례)
 *            matches: number[];                — 모든 열이 같은 줄 번호들
 *            hits: number[][];                 — 열마다, 그 열 값만 같은 줄 번호들
 *          }
 *
 * 같음은 값 전체의 같음이다 (대소문자를 가린다, 다듬지 않는다). 빈 값 · 열 수가 어긋난
 * 줄 · 물음은 셈할 수 없어 던진다 (C6).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RowIsAFactFacetData = {
  type: 'row-is-a-fact';
  stepMs: number;
  /** 표 이름 — 번역하지 않는 자료 */
  table: string;
  /** 열 이름 — 번역하지 않는 자료 */
  columns: string[];
  /** 줄 (데이터 차례) */
  rows: string[][];
  /** 물음 — 열마다 값 하나 */
  queries: string[][];
};

/** 줄 · 물음 한 개가 열 수에 맞고 빈 값이 없는지 확인한다. */
function checkTuple(what: string, tuple: string[], width: number): void {
  if (tuple.length !== width) {
    throw new Error(`row-is-a-fact: ${what} 의 값 수 ${tuple.length} 가 열 수 ${width} 와 다르다`);
  }
  for (const [i, v] of tuple.entries()) {
    if (typeof v !== 'string' || v === '') {
      throw new Error(`row-is-a-fact: ${what} 의 ${i} 번째 값이 비었다`);
    }
  }
}

export async function rowIsAFact(ctx: FacetContext<RowIsAFactFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<RowIsAFactFacetData>;
  const { columns, rows, queries, stepMs } = ctx.data;
  if (columns.length === 0) throw new Error('row-is-a-fact: 열이 없다');
  for (const [i, r] of rows.entries()) checkTuple(`줄 ${i}`, r, columns.length);
  for (const [i, q] of queries.entries()) checkTuple(`물음 ${i}`, q, columns.length);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 표가 이미 서 있는 화면이라, 첫 발신 앞에도 읽을 틈을 둔다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'frame', payload: {} });

  for (let row = 0; row < rows.length; row += 1) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'fact', payload: { row } });
  }

  for (let query = 0; query < queries.length; query += 1) {
    if (!(await pause())) return;
    const q = queries[query];
    if (q === undefined) throw new Error(`row-is-a-fact: 물음 ${query} 이 없다`);
    const hits: number[][] = columns.map((_, c) => {
      const out: number[] = [];
      for (const [i, r] of rows.entries()) if (r[c] === q[c]) out.push(i);
      return out;
    });
    const matches: number[] = [];
    for (const [i, r] of rows.entries()) {
      if (r.every((v, c) => v === q[c])) matches.push(i);
    }
    await ctx.emit({ type: 'ask', payload: { query, matches, hits } });
  }
}
