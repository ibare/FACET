/**
 * set-of-rows — 줄을 뒤섞거나 같은 줄을 한 번 더 넣어도 릴레이션은 같다.
 *
 * 걸음 0 은 장면의 initial 이 차례 A 의 표를 세운다 (읽을 것이 있으니 첫 발신 앞에 stepMs 를 둔다).
 *
 * 이벤트 (전부 silent 아님, 한 걸음 = emit 하나):
 * - `move`  { moves: { from: number; to: number }[] }
 *           A 의 i 번째 줄(from, 0 부터)이 차례 B 에서 앉는 자리(to, 0 부터). moves[i] 는 A 의 i 번째 줄.
 * - `match` { pairs: { a: number; b: number }[]; aInB: number; aSize: number; bInA: number; bSize: number; same: boolean }
 *           모음으로 견준다 — A 의 줄 가운데 B 에 있는 수, B 의 줄 가운데 A 에 있는 수, 둘이 다 차면 같다.
 * - `enter` { twin: number | null }
 *           들어오는 줄과 모든 열 값이 같은 B 의 줄 자리 (없으면 null).
 * - `merge` { twin: number | null; before: number; after: number; same: boolean }
 *           모음에 더한다 — 같은 줄이 있으면 포개져 줄 수가 늘지 않는다. same 은 더한 뒤 모음이 A 와 같은가.
 *
 * 셈할 수 없는 자료(빈 값 · 열 수가 다른 줄 · 한 차례 안에 같은 줄 둘 · B 에 없는 A 의 줄)는 던진다 (C6).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Row = readonly string[];

export type SetOfRowsFacetData = {
  type: 'set-of-rows';
  stepMs: number;
  relation: string;
  columns: readonly string[];
  orderA: readonly Row[];
  orderB: readonly Row[];
  incoming: Row;
};

function readText(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') throw new Error(`set-of-rows: ${where} 이 빈 값이거나 글자가 아니다`);
  return v;
}

function readRow(v: unknown, width: number, where: string): Row {
  if (!Array.isArray(v)) throw new Error(`set-of-rows: ${where} 이 줄(배열)이 아니다`);
  if (v.length !== width) throw new Error(`set-of-rows: ${where} 의 칸 수 ${v.length} 가 열 수 ${width} 와 다르다`);
  return v.map((cell, i) => readText(cell, `${where} 의 ${i} 번 칸`));
}

/** 줄 같음 = 모든 열 값이 같다 (대소문자를 가리고 다듬지 않는다). */
export function sameRow(x: Row, y: Row): boolean {
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

function readOrder(v: unknown, width: number, name: string): Row[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`set-of-rows: ${name} 가 줄 목록이 아니거나 비었다`);
  const rows = v.map((r, i) => readRow(r, width, `${name}[${i}]`));
  rows.forEach((r, i) => {
    const first = rows.findIndex((o) => sameRow(o, r));
    if (first !== i) throw new Error(`set-of-rows: ${name}[${i}] 가 ${name}[${first}] 와 같은 줄이다 — 모음이 아니다`);
  });
  return rows;
}

/** 초기 자료를 좁힌다. 알고리즘과 장면이 함께 쓴다. */
export function readSetOfRowsData(raw: unknown): SetOfRowsFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('set-of-rows: initialData 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'set-of-rows') throw new Error('set-of-rows: initialData.type 이 set-of-rows 가 아니다');
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) throw new Error('set-of-rows: stepMs 가 양수가 아니다');
  const relation = readText(d.relation, 'relation');
  if (!Array.isArray(d.columns) || d.columns.length === 0) throw new Error('set-of-rows: columns 가 비었다');
  const columns = d.columns.map((c, i) => readText(c, `columns[${i}]`));
  const width = columns.length;
  return {
    type: 'set-of-rows',
    stepMs: d.stepMs,
    relation,
    columns,
    orderA: readOrder(d.orderA, width, 'orderA'),
    orderB: readOrder(d.orderB, width, 'orderB'),
    incoming: readRow(d.incoming, width, 'incoming'),
  };
}

function placeRows(a: readonly Row[], b: readonly Row[]): { from: number; to: number }[] {
  return a.map((row, from) => {
    const to = b.findIndex((o) => sameRow(o, row));
    if (to < 0) throw new Error(`set-of-rows: orderA[${from}] 가 orderB 에 없다 — 옮겨 앉을 자리가 없다`);
    return { from, to };
  });
}

function countIn(rows: readonly Row[], other: readonly Row[]): number {
  return rows.filter((r) => other.some((o) => sameRow(o, r))).length;
}

function sameSet(x: readonly Row[], y: readonly Row[]): boolean {
  return countIn(x, y) === x.length && countIn(y, x) === y.length;
}

export async function setOfRows(ctx: FacetContext<SetOfRowsFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SetOfRowsFacetData>;
  const data = readSetOfRowsData(ctx.data);
  const a = data.orderA;
  const b = data.orderB;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 (차례 A 의 표) 을 읽을 틈
  if (!(await pause())) return;

  const moves = placeRows(a, b);
  await ctx.emit({ type: 'move', payload: { moves } });
  if (!(await pause())) return;

  const pairs = moves.map((m) => ({ a: m.from, b: m.to }));
  await ctx.emit({
    type: 'match',
    payload: {
      pairs,
      aInB: countIn(a, b),
      aSize: a.length,
      bInA: countIn(b, a),
      bSize: b.length,
      same: sameSet(a, b),
    },
  });
  if (!(await pause())) return;

  const found = b.findIndex((o) => sameRow(o, data.incoming));
  const twin = found < 0 ? null : found;
  await ctx.emit({ type: 'enter', payload: { twin } });
  if (!(await pause())) return;

  const after = twin === null ? [...b, data.incoming] : [...b];
  await ctx.emit({
    type: 'merge',
    payload: { twin, before: b.length, after: after.length, same: sameSet(after, a) },
  });
}
