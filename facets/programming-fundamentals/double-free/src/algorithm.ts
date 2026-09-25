/**
 * double-free — 같은 칸을 두 번 돌려주면 할당기가 그 칸을 두 이름에게 내준다.
 *
 * 줄 목록(`lines`)의 구조(`stmt`)를 작은 해석기로 밟는다. 글자(`text`)는 읽지 않는다.
 * 할당기는 장난감이다 — free 받은 덩이가 이미 빈 자리 목록에 있는지 보지 않는다.
 *
 * 걸음: 시작 1 + 밟은 줄마다 1. 내장(allocate · free · valueAt · address)은 걸음을 늘리지 않는다.
 *
 * 모든 줄 이벤트는 그 줄을 마친 뒤의 **모습**(snapshot)을 함께 싣는다 — 장면은 할당기를 다시
 * 돌리지 않고 이 모습을 잇는다.
 *
 * 모습(Snap):
 *   vals      (number | 'null' | null)[]  스택 칸마다 값. null 은 "비어 있음"(아직 넣지 않았다)
 *   cells     { addr: number; value: number | 'null' | null; holders: string[] }[]
 *             새 땅에서 뗀 힙 칸. holders 는 이 칸을 allocate 로 받고 아직 free 하지 않은 이름들
 *   freelist  number[]   빈 자리 목록의 덩이 시작 주소, 앞이 가장 최근
 *   landEnd   number     새 땅의 시작 (한 번도 빌려 주지 않은 땅)
 *   out       (number | 'null')[]  지금까지의 출력
 *
 * 이벤트 (모두 non-silent — 하나가 한 걸음):
 *   init   { code: { indent: number; text: string }[]; slots: { name: string; addr: number }[];
 *            heapBase: number } & Snap
 *          시작. 프로그램 전체와 바깥 틀의 칸(비어 있음)
 *   alloc  { line: number; from: number; name: string; addr: number; source: 'land' | 'list';
 *            landBefore: number } & Snap
 *          `let name = allocate(n)` — source 는 새 땅에서 뗐는지 목록에서 꺼냈는지.
 *          from 은 앞 걸음의 줄(-1 이면 없음), landBefore 는 이 줄 앞의 새 땅 시작
 *   free   { line: number; from: number; name: string; addr: number } & Snap
 *          `free(name)` — addr 가 목록 맨 앞에 오른다 (이미 있어도)
 *   store  { line: number; from: number; name: string; addr: number; value: number | 'null';
 *            was: number | 'null' | null } & Snap
 *          `valueAt(name) = value` — was 는 덮이기 전 칸의 값
 *   show   { line: number; from: number; name: string; addr: number; value: number | 'null';
 *            mine: number | 'null' | null } & Snap
 *          `show valueAt(name)` — mine 은 name 을 거쳐 마지막으로 넣은 값(없으면 null)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { num: number }
  | { null: true }
  | { var: string }
  | { call: string; args: Expr[] };

export type Stmt =
  | { k: 'assign'; to: string; declare?: boolean; value: Expr }
  | { k: 'store'; addr: Expr; value: Expr }
  | { k: 'expr'; value: Expr }
  | { k: 'show'; value: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type DoubleFreeFacetData = {
  type: 'double-free';
  stepMs: number;
  /** 스택 칸 주소의 시작 (예로 정한 값) */
  stackBase: number;
  /** 힙 칸 주소의 시작 (예로 정한 값) */
  heapBase: number;
  lines: CodeLine[];
};

type Val = number | 'null';

/** 한 줄에서 일어난 내장 부르기 — 이벤트 종류를 가른다 */
type Effect =
  | { kind: 'alloc'; addr: number; source: 'land' | 'list' }
  | { kind: 'free'; name: string; addr: number }
  | { kind: 'read'; name: string; addr: number; value: Val }
  | null;

export async function doubleFree(context: FacetContext<DoubleFreeFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<DoubleFreeFacetData>;
  const { lines, stepMs, stackBase, heapBase } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 바깥 틀의 칸 — let 이름을 글자 차례로, 시작에서 한꺼번에 잡는다
  const names: string[] = [];
  for (const ln of lines) {
    if (ln.stmt.k === 'assign' && ln.stmt.declare === true && !names.includes(ln.stmt.to)) {
      names.push(ln.stmt.to);
    }
  }
  const slotOf = new Map<string, number>(names.map((n, i) => [n, i]));
  const vals: (Val | null)[] = names.map(() => null);

  // 할당기
  const heap = new Map<number, Val | null>();
  const blocks = new Map<number, number>(); // 빌려 준 덩이: 시작 → 칸 수
  const seenSize = new Map<number, number>(); // 한 번이라도 빌려 준 덩이의 칸 수
  const holders = new Map<number, string[]>(); // 받고 아직 free 하지 않은 이름
  let freelist: { addr: number; size: number }[] = [];
  let landEnd = heapBase;
  const out: Val[] = [];
  const putVia = new Map<string, Val>(); // 이름을 거쳐 마지막으로 넣은 값

  let effect: Effect = null;
  /** 지금 밟는 줄 — 던지는 오류가 L<n> 과 그 줄 글자를 싣는다 (-1 이면 줄 밖) */
  let cur = -1;

  function fail(msg: string): never {
    const where = cur >= 0 ? `L${cur + 1} "${lines[cur]?.text ?? ''}"` : '줄 밖';
    throw new Error(`double-free ${where}: ${msg}`);
  }

  function firstArg(e: { call: string; args: Expr[] }): Expr {
    const arg = e.args[0];
    if (arg === undefined) fail(`${e.call} 에 인자가 없다`);
    return arg;
  }

  function argName(e: { call: string; args: Expr[] }): string {
    const arg = firstArg(e);
    if (!('var' in arg)) fail(`${e.call} 의 인자는 이름이어야 한다`);
    return arg.var;
  }

  function readVar(name: string): Val | null {
    const i = slotOf.get(name);
    if (i === undefined) fail(`선언되지 않은 이름 ${name}`);
    return vals[i] ?? null;
  }

  function asAddr(v: Val | null): number {
    if (typeof v !== 'number') fail('주소가 아닌 값을 따라갔다');
    return v;
  }

  function evalExpr(e: Expr): Val | null {
    if ('num' in e) return e.num;
    if ('null' in e) return 'null';
    if ('var' in e) return readVar(e.var);
    const fn = e.call;
    if (fn === 'allocate') {
      const n = evalExpr(firstArg(e));
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
        fail('allocate 의 칸 수가 1 이상의 정수가 아니다');
      }
      const k = freelist.findIndex((b) => b.size === n);
      let addr: number;
      if (k >= 0) {
        addr = freelist[k]!.addr;
        freelist = freelist.filter((_, j) => j !== k);
        effect = { kind: 'alloc', addr, source: 'list' };
      } else {
        addr = landEnd;
        landEnd += n;
        for (let c = addr; c < addr + n; c += 1) heap.set(c, null);
        effect = { kind: 'alloc', addr, source: 'land' };
      }
      blocks.set(addr, n);
      seenSize.set(addr, n);
      return addr;
    }
    if (fn === 'free') {
      const name = argName(e);
      const addr = asAddr(readVar(name));
      // 장난감 할당기: 이미 목록에 있는지는 보지 않는다 (이 조각의 전제).
      // 한 번도 빌려 준 적 없는 주소는 그 덩이의 칸 수를 알 길이 없어 던진다
      const size = blocks.get(addr) ?? seenSize.get(addr);
      if (size === undefined) fail(`빌려 준 적 없는 주소 ${addr} 를 free 했다`);
      blocks.delete(addr);
      holders.delete(addr);
      freelist = [{ addr, size }, ...freelist];
      effect = { kind: 'free', name, addr };
      return null;
    }
    if (fn === 'valueAt') {
      const name = argName(e);
      const addr = asAddr(readVar(name));
      if (!heap.has(addr)) fail(`뗀 적 없는 칸 ${addr} 를 읽었다`);
      const v = heap.get(addr) ?? null;
      if (v === null) fail(`빈 칸 ${addr} 를 읽었다`);
      effect = { kind: 'read', name, addr, value: v };
      return v;
    }
    if (fn === 'address') {
      const name = argName(e);
      const i = slotOf.get(name);
      if (i === undefined) fail(`선언되지 않은 이름 ${name}`);
      return stackBase + i;
    }
    return fail(`모르는 부르기 ${fn}`);
  }

  function snap() {
    const cells: { addr: number; value: Val | null; holders: string[] }[] = [];
    for (let a = heapBase; a < landEnd; a += 1) {
      cells.push({ addr: a, value: heap.get(a) ?? null, holders: [...(holders.get(a) ?? [])] });
    }
    return {
      vals: [...vals],
      cells,
      freelist: freelist.map((b) => b.addr),
      landEnd,
      out: [...out],
    };
  }

  // 걸음 0 — 프로그램 전체와 비어 있는 칸
  await ctx.emit({
    type: 'init',
    payload: {
      code: lines.map((l) => ({ indent: l.indent, text: l.text })),
      slots: names.map((name, i) => ({ name, addr: stackBase + i })),
      heapBase,
      ...snap(),
    },
  });

  let from = -1;
  for (let line = 0; line < lines.length; line += 1) {
    if (!(await pause())) return;
    cur = line;
    const stmt = lines[line]!.stmt;
    effect = null;
    const landBefore = landEnd;

    if (stmt.k === 'assign') {
      const v = evalExpr(stmt.value);
      const i = slotOf.get(stmt.to);
      if (i === undefined) fail(`선언되지 않은 이름 ${stmt.to}`);
      vals[i] = v;
      const fx = effect as Effect;
      if (fx === null || fx.kind !== 'alloc') fail('allocate 없는 대입');
      holders.set(fx.addr, [...(holders.get(fx.addr) ?? []), stmt.to]);
      await ctx.emit({
        type: 'alloc',
        payload: {
          line, from, name: stmt.to, addr: fx.addr, source: fx.source, landBefore, ...snap(),
        },
      });
    } else if (stmt.k === 'expr') {
      evalExpr(stmt.value);
      const fx = effect as Effect;
      if (fx === null || fx.kind !== 'free') fail('free 아닌 부르기 줄');
      await ctx.emit({
        type: 'free',
        payload: { line, from, name: fx.name, addr: fx.addr, ...snap() },
      });
    } else if (stmt.k === 'store') {
      if (!('var' in stmt.addr)) fail('valueAt(…) = 의 자리는 이름이어야 한다');
      const name = stmt.addr.var;
      const addr = asAddr(readVar(name));
      if (!heap.has(addr)) fail(`뗀 적 없는 칸 ${addr} 에 넣었다`);
      const value = evalExpr(stmt.value);
      if (value === null) fail('빈 값을 넣었다');
      const was = heap.get(addr) ?? null;
      heap.set(addr, value);
      putVia.set(name, value);
      await ctx.emit({
        type: 'store',
        payload: { line, from, name, addr, value, was, ...snap() },
      });
    } else if (stmt.k === 'show') {
      const value = evalExpr(stmt.value);
      const fx = effect as Effect;
      if (value === null || fx === null || fx.kind !== 'read') fail('show valueAt(…) 꼴이 아니다');
      out.push(value);
      await ctx.emit({
        type: 'show',
        payload: {
          line, from, name: fx.name, addr: fx.addr, value, mine: putVia.get(fx.name) ?? null, ...snap(),
        },
      });
    } else {
      fail(`모르는 문 ${String((stmt as { k?: unknown }).k)}`);
    }
    from = line;
  }
}
