/**
 * pointer-dereference — 주소를 따라 건너간다. 한 번과 두 번.
 *
 * 줄 목록(구조)을 해석한다. 바깥 틀이 시작에서 맨 바깥의 `let` 이름들의 칸을 한꺼번에
 * 잡는다 — 칸 주소는 STACK_BASE 부터 하나씩 오른다. `address(x)` 는 x 의 칸 주소,
 * `valueAt(a)` 는 주소 a 의 칸 내용이다.
 *
 * 걸음은 줄 걸음 + 따라감 걸음이다. `valueAt` 이 든 줄은 그 줄의 걸음이 가장 안쪽
 * 이름의 칸에서 수를 읽는 것이고, 그 뒤 `valueAt` 하나마다 한 걸음(안쪽부터)이다.
 *
 * 이벤트 (모두 걸음이다. silent 없음):
 *
 *   init    { lines: { indent: number; text: string }[];
 *             cells: { name: string; addr: number }[] }
 *           걸음 0. 프로그램 전체와 바깥 틀의 칸들 (아직 비어 있다)
 *
 *   assign  { line: number; cell: number; value: number;
 *             kind: 'value' | 'address'; source: number | null }
 *           줄 하나가 칸 `cell` 에 값을 넣는다. kind 가 'address' 면 value 는 주소다.
 *           source 는 `address(name)` 의 name 칸 번호 (값이 수 글자에서 왔으면 null)
 *
 *   read    { line: number; cell: number; value: number; kind: 'value' | 'address' }
 *           `valueAt` 이 든 줄의 걸음 — 가장 안쪽 이름의 칸에서 수를 읽어 손에 든다
 *
 *   hop     { line: number; n: number; from: number; to: number; value: number;
 *             kind: 'value' | 'address'; last: boolean }
 *           따라감 한 걸음 — 손에 든 수를 주소로 삼아 칸 `from` 에서 칸 `to` 로 건너가
 *           내용 value 를 읽는다. n 은 이 줄에서 몇 번째 건넘인가 (1 부터).
 *           last 면 이 값이 `show` 의 출력이다
 *
 * 칸 번호(cell)는 init 의 cells 차례다. line 은 0 부터 센 줄 차례다.
 *
 * 해석기가 모르는 모양(문 · 식)이나 셈할 수 없는 상태(없는 이름 · 빈 칸 · 없는 주소)를
 * 만나면 줄 번호와 이름을 담아 던진다 — 걸음이 줄어든 그림을 오류 없이 내지 않는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 식 — 이 조각이 읽는 모양만 */
export type PointerExpr =
  | { num: number }
  | { var: string }
  | { call: string; args: PointerExpr[] };

/** 문 — 이 조각이 읽는 모양만 */
export type PointerStmt =
  | { k: 'assign'; to: string; value: PointerExpr; declare?: boolean }
  | { k: 'show'; value: PointerExpr };

export type PointerLine = { indent: number; text: string; stmt: PointerStmt };

export type PointerDereferenceFacetData = {
  type: 'pointer-dereference';
  stepMs: number;
  /** 바깥 틀 칸 주소의 시작 (예로 정한 값) */
  stackBase: number;
  lines: PointerLine[];
};

type Kind = 'value' | 'address';
type Content = { value: number; kind: Kind };

/** 맨 바깥 `let` 이름을 글자 차례로 — 바깥 틀이 한꺼번에 잡는 칸 */
function frameNames(lines: readonly PointerLine[]): string[] {
  const names: string[] = [];
  for (const line of lines) {
    const s = line.stmt;
    if (line.indent === 0 && s.k === 'assign' && s.declare === true && !names.includes(s.to)) {
      names.push(s.to);
    }
  }
  return names;
}

/** valueAt(valueAt(… name …)) 를 풀어 가장 안쪽 이름과 겹 수를 얻는다 */
function unwrapValueAt(e: PointerExpr): { name: string; depth: number } | null {
  let depth = 0;
  let cur: PointerExpr = e;
  while ('call' in cur) {
    if (cur.call !== 'valueAt' || cur.args.length !== 1) return null;
    depth += 1;
    cur = cur.args[0]!;
  }
  return 'var' in cur ? { name: cur.var, depth } : null;
}

export async function pointerDereference(
  ctx: FacetContext<PointerDereferenceFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<PointerDereferenceFacetData>;
  const { lines, stepMs, stackBase } = rctx.data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const names = frameNames(lines);
  const cells = names.map((name, i) => ({ name, addr: stackBase + i }));
  const contents: (Content | null)[] = cells.map(() => null);
  const cellOfName = (name: string): number => names.indexOf(name);
  const cellOfAddr = (addr: number): number => cells.findIndex((c) => c.addr === addr);

  await rctx.emit({
    type: 'init',
    payload: {
      lines: lines.map((l) => ({ indent: l.indent, text: l.text })),
      cells,
    },
  });

  /** 데이터가 해석기와 어긋나면 걸음을 줄여 그리지 않고 멈춘다 */
  function fail(li: number, why: string): never {
    throw new Error(`pointerDereference: L${li + 1} — ${why}`);
  }

  for (let li = 0; li < lines.length; li += 1) {
    if (!(await pause())) return;
    const s: PointerStmt = lines[li]!.stmt;

    if (s.k === 'assign') {
      const cell = cellOfName(s.to);
      if (cell < 0) fail(li, `'${s.to}' 는 바깥 틀에 없는 이름이다`);
      const v = s.value;
      let content: Content;
      let source: number | null = null;
      if ('num' in v) {
        content = { value: v.num, kind: 'value' };
      } else if ('call' in v && v.call === 'address' && v.args.length === 1) {
        const arg = v.args[0]!;
        // address 의 인자는 셈하지 않고 이름으로 읽는다
        if (!('var' in arg)) fail(li, 'address 의 인자가 이름이 아니다');
        source = cellOfName(arg.var);
        if (source < 0) fail(li, `address('${arg.var}') — 바깥 틀에 없는 이름이다`);
        content = { value: cells[source]!.addr, kind: 'address' };
      } else if ('var' in v) {
        const from = cellOfName(v.var);
        if (from < 0) fail(li, `'${v.var}' 는 바깥 틀에 없는 이름이다`);
        const c = contents[from];
        if (c === null || c === undefined) fail(li, `'${v.var}' 의 칸이 비어 있다`);
        content = c;
      } else {
        fail(li, `'${s.to}' 에 넣는 식의 모양을 모른다`);
      }
      contents[cell] = content;
      await rctx.emit({
        type: 'assign',
        payload: { line: li, cell, value: content.value, kind: content.kind, source },
      });
      continue;
    }

    if (s.k !== 'show') fail(li, `모르는 문 '${(s as { k: unknown }).k}'`);

    // show valueAt(…(name)…)
    const chain = unwrapValueAt(s.value);
    if (chain === null) fail(li, 'show 의 식이 valueAt(… 이름 …) 모양이 아니다');
    if (chain.depth === 0) fail(li, `show ${chain.name} — valueAt 이 없다`);
    const start = cellOfName(chain.name);
    if (start < 0) fail(li, `'${chain.name}' 는 바깥 틀에 없는 이름이다`);
    const first = contents[start];
    if (first === null || first === undefined) fail(li, `'${chain.name}' 의 칸이 비어 있다`);
    await rctx.emit({
      type: 'read',
      payload: { line: li, cell: start, value: first.value, kind: first.kind },
    });

    let at = start;
    let held: Content = first;
    for (let n = 1; n <= chain.depth; n += 1) {
      if (!(await pause())) return;
      const to = cellOfAddr(held.value);
      if (to < 0) fail(li, `건넘 ${n} — 주소 ${held.value} 의 칸이 없다`);
      const got = contents[to];
      if (got === null || got === undefined) fail(li, `건넘 ${n} — 주소 ${held.value} 의 칸이 비어 있다`);
      await rctx.emit({
        type: 'hop',
        payload: {
          line: li,
          n,
          from: at,
          to,
          value: got.value,
          kind: got.kind,
          last: n === chain.depth,
        },
      });
      at = to;
      held = got;
    }
  }
}
