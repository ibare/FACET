/**
 * 최좌측 접두 — 복합 인덱스는 왼쪽 열부터 맞아야 이어진 덩어리를 짚는다.
 *
 * 표의 줄을 인덱스 열 차례 (사전순, 같으면 먼저 넣은 줄이 앞) 로 정렬해 인덱스 항목을 얻고,
 * 질의마다 조건에 든 인덱스 열이 왼쪽부터 몇 개 이어지는지 (lead) 를 센다.
 *
 * - lead ≥ 1: 첫 맞는 항목을 곧장 짚고 (짚는 비용은 세지 않는다) 그 자리부터 차례로 본다.
 *   맞지 않는 항목을 처음 만나면 그 항목까지 보고 멈춘다.
 * - lead = 0: 항목 1 부터 끝까지 전부 본다.
 *
 * 이벤트 (자리는 모두 정렬된 인덱스 안의 1 부터 번호):
 *
 * - `init` (silent) — 걸음 0 의 바탕
 *     { table: string, indexName: string, columns: string[],
 *       entries: { row: string, values: string[] }[],   // 정렬된 인덱스 항목, values 는 columns 차례
 *       queries: { id: string, sql: string }[] }
 * - `query` — 질의 하나를 보인다
 *     { q: number (0 부터), lead: number }
 * - `narrow` — 앞 열이 있는 질의가 이어진 덩어리로 좁혀진다
 *     { q: number, examined: number[], hits: number[],
 *       outer: [number, number] | null }  // lead ≥ 2 일 때 앞 lead-1 열이 맞는 덩어리의 양 끝
 * - `scan` — 앞 열이 없는 질의가 처음부터 끝까지 훑는다
 *     { q: number, examined: number[], hits: number[] }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LeftmostPrefixFacetData = {
  type: 'leftmost-prefix';
  stepMs: number;
  table: string;
  index: { name: string; columns: string[] };
  rows: { row: string; cells: Record<string, string> }[];
  queries: { id: string; sql: string; where: { column: string; value: string }[] }[];
};

type Entry = { row: string; values: string[] };

function compareBytes(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** 조건 구조에서 SQL 글자를 다시 지어 선언의 글자와 견준다 — 둘이 갈리면 던진다. */
function sqlFromWhere(table: string, where: { column: string; value: string }[]): string {
  const parts = where.map((w) => `${w.column} = '${w.value}'`);
  return `SELECT * FROM ${table} WHERE ${parts.join(' AND ')}`;
}

export async function leftmostPrefix(context: FacetContext<LeftmostPrefixFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<LeftmostPrefixFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  const columns = data.index.columns;
  if (columns.length === 0) throw new Error('leftmost-prefix: 인덱스 열이 없다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const unsorted = data.rows.map((r, order) => {
    const values = columns.map((c) => {
      const v = r.cells[c];
      if (typeof v !== 'string') throw new Error(`leftmost-prefix: 줄 ${r.row} 에 열 ${c} 값이 없다`);
      return v;
    });
    return { row: r.row, values, order };
  });
  const sorted: Entry[] = [...unsorted]
    .sort((a, b) => {
      for (let i = 0; i < columns.length; i += 1) {
        const d = compareBytes(a.values[i] as string, b.values[i] as string);
        if (d !== 0) return d;
      }
      return a.order - b.order;
    })
    .map((e) => ({ row: e.row, values: e.values }));

  for (const q of data.queries) {
    if (q.where.length === 0) throw new Error(`leftmost-prefix: ${q.id} 에 조건이 없다`);
    for (const w of q.where) {
      if (!columns.includes(w.column)) {
        throw new Error(`leftmost-prefix: ${q.id} 의 열 ${w.column} 은 인덱스에 없다`);
      }
    }
    const rebuilt = sqlFromWhere(data.table, q.where);
    if (rebuilt !== q.sql) throw new Error(`leftmost-prefix: ${q.id} 의 SQL 글자가 조건과 다르다 — ${rebuilt}`);
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      table: data.table,
      indexName: data.index.name,
      columns: [...columns],
      entries: sorted.map((e) => ({ row: e.row, values: [...e.values] })),
      queries: data.queries.map((q) => ({ id: q.id, sql: q.sql })),
    },
  });

  // 걸음 0 은 이미 읽을 것이 있는 화면 (정렬된 항목) 이라 첫 발신 앞에 틈을 둔다.
  if (!(await pause())) return;

  for (let qi = 0; qi < data.queries.length; qi += 1) {
    if (ctx.cancelled) return;
    const query = data.queries[qi]!;
    const colOf = (name: string): number => columns.indexOf(name);
    const matches = (e: Entry): boolean =>
      query.where.every((w) => e.values[colOf(w.column)] === w.value);

    let lead = 0;
    while (lead < columns.length && query.where.some((w) => w.column === columns[lead])) {
      if (ctx.cancelled) return;
      lead += 1;
    }

    await ctx.emit({ type: 'query', payload: { q: qi, lead } });
    if (!(await pause())) return;

    const hits: number[] = [];
    sorted.forEach((e, i) => {
      if (matches(e)) hits.push(i + 1);
    });

    if (lead > 0) {
      const start = sorted.findIndex(matches);
      if (start < 0) throw new Error(`leftmost-prefix: ${query.id} 에 맞는 항목이 없어 짚을 자리가 없다`);
      const examined: number[] = [];
      for (let i = start; i < sorted.length; i += 1) {
        if (ctx.cancelled) return;
        examined.push(i + 1);
        if (!matches(sorted[i]!)) break;
      }
      let outer: [number, number] | null = null;
      if (lead >= 2) {
        const prefixCols = columns.slice(0, lead - 1);
        const inPrefix = (e: Entry): boolean =>
          prefixCols.every((c) => {
            const w = query.where.find((x) => x.column === c);
            if (!w) throw new Error(`leftmost-prefix: ${query.id} 에 앞 열 ${c} 조건이 없다`);
            return e.values[colOf(c)] === w.value;
          });
        const block: number[] = [];
        sorted.forEach((e, i) => {
          if (inPrefix(e)) block.push(i + 1);
        });
        const lo = block[0];
        const hi = block[block.length - 1];
        if (lo === undefined || hi === undefined) throw new Error(`leftmost-prefix: ${query.id} 의 앞 열 덩어리가 비었다`);
        outer = [lo, hi];
      }
      await ctx.emit({ type: 'narrow', payload: { q: qi, examined, hits, outer } });
    } else {
      const examined = sorted.map((_, i) => i + 1);
      await ctx.emit({ type: 'scan', payload: { q: qi, examined, hits } });
    }
    if (!(await pause())) return;
  }
}
