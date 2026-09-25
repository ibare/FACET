/**
 * 스택과 힙 — 함수가 끝나면 그 안에서 만든 것은 어디에 남는가.
 *
 * `initialData.lines` 의 줄 구조를 작은 해석기가 실제로 밟는다. 틀은 설 때 제 이름의 칸을
 * 한꺼번에 잡고(인자 먼저, 그다음 몸 안의 `let` 이름을 글자 차례로) 걷힐 때 통째로 내려놓는다.
 * 힙은 할당기가 맡는다 — 빌린 덩이는 새 땅 끝에서 떼어 주고 끝을 민다(이 프로그램은 돌려주는 줄이 없다). 걸음 차례 · 주소 · 값은 전부 이
 * 해석에서 나온다 — 손으로 적은 걸음표는 없다.
 *
 * 걸음 — 줄 걸음. 걸음 0 은 시작(프로그램 전체, 바깥 틀의 칸은 비었다). 밟은 줄 하나가 한 걸음이고
 * `function` 줄은 밟지 않는다. 사용자 함수를 부르는 줄은 부르는 걸음과 돌아와 마무리하는 걸음으로
 * 두 번 밟힌다. 틀이 걷히는 것은 따로 걸음이 아니다 — `return` 걸음에는 틀이 있고 마무리 걸음에는 없다.
 *
 * 모든 걸음의 payload 에는 그 걸음이 끝난 뒤의 모습이 함께 실린다.
 *   frames — `{ fn: string; slots: { name: string; addr: number; value: Val | null }[] }[]`
 *            아래(바깥 틀)에서 위로. `fn` 이 빈 글자면 바깥 틀. `value: null` 은 칸이 잡혔지만 비어 있다
 *   heap   — `{ addr: number; value: Val | null }[]` 빌려 준 칸, 주소 차례. `value: null` 은 아직 비었다
 *   out    — `Val[]` 지금까지 내보낸 값
 *   Val    — `{ k: 'num'; n: number } | { k: 'addr'; a: number } | { k: 'null' }`
 *
 * 이벤트 (전부 silent 아님, `init` 만 silent)
 *   init    { frames, heap, out }                               silent — 시작 모습(걸음 0 을 갈아 끼운다)
 *   call    { line, fn, args: Val[], frames, heap, out }        사용자 함수를 부르는 걸음
 *   assign  { line, name, value: Val, alloc: number | null, stood: boolean, frames, heap, out }
 *             이름 칸에 값을 넣는 줄. `alloc` 은 이 줄에서 빌린 덩이의 시작 주소. `stood` 는 이 걸음에
 *             새 틀이 섰는가(틀이 선 뒤 처음 밟는 줄)
 *   store   { line, addr, value: Val, from: string | null, stood, frames, heap, out }
 *             `valueAt(addr) = value`. `from` 은 값이 온 이름(값이 이름 하나일 때)
 *   return  { line, value: Val, stood, frames, heap, out }      돌려주는 걸음. 틀은 아직 있다
 *   finish  { line, name, value: Val, was: Frame, frames, heap, out }
 *             부른 줄에 돌아와 마무리하는 걸음. `was` 는 방금 걷힌 틀의 마지막 모습(계기값)
 *   show    { line, value: Val, hops: { addr: number; value: Val }[], stood, frames, heap, out }
 *             값을 내보낸다. `hops` 는 `valueAt` 이 따라간 자취
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Val = { k: 'num'; n: number } | { k: 'addr'; a: number } | { k: 'null' };

export type Expr =
  | { num: number }
  | { null: true }
  | { var: string }
  | { op: '+'; l: Expr; r: Expr }
  | { call: string; args: Expr[] };

export type Stmt =
  | { k: 'function'; name: string; params: string[] }
  | { k: 'assign'; to: string; value: Expr; declare?: boolean }
  | { k: 'store'; addr: Expr; value: Expr }
  | { k: 'show'; value: Expr }
  | { k: 'return'; value: Expr };

export type Line = { indent: number; text: string; stmt: Stmt };

export type StackVsHeapFacetData = {
  type: 'stack-vs-heap';
  stepMs: number;
  /** 스택 칸 주소의 시작 (예로 정한 값). */
  stackBase: number;
  /** 힙 칸 주소의 시작 (예로 정한 값). */
  heapBase: number;
  lines: Line[];
};

export type SlotSnap = { name: string; addr: number; value: Val | null };
export type FrameSnap = { fn: string; slots: SlotSnap[] };
export type CellSnap = { addr: number; value: Val | null };

/** 틀을 세우지 않는 내장. 이 조각의 프로그램은 `free` 를 부르지 않아 해석하지 않는다. */
const BUILTIN = new Set(['allocate', 'free', 'valueAt', 'address']);

type Frame = { fn: string; slots: Map<string, number> };
type Outcome = { kind: 'stop' } | { kind: 'done' } | { kind: 'ret'; value: Val };

/** 몸의 끝 — i 줄보다 깊이 들여 쓴 줄이 이어지는 데까지. */
function bodyEnd(lines: Line[], i: number): number {
  let j = i + 1;
  while (j < lines.length && lines[j]!.indent > lines[i]!.indent) j += 1;
  return j;
}

function isUserCall(e: Expr): e is { call: string; args: Expr[] } {
  return 'call' in e && !BUILTIN.has(e.call);
}

export async function stackVsHeap(ctx0: FacetContext<StackVsHeapFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<StackVsHeapFacetData>;
  const { lines, stepMs, stackBase, heapBase } = ctx.data;

  const frames: Frame[] = [];
  const cells = new Map<number, Val>();
  const heap = new Map<number, Val | null>();
  const blocks = new Map<number, number>();
  let heapTop = heapBase;
  let stackTop = stackBase;
  const out: Val[] = [];
  let hops: { addr: number; value: Val }[] = [];
  let lastAlloc: number | null = null;
  let stood = false;
  /** 지금 해석하는 줄(0 부터). 던지는 메시지가 `L<n>:` 로 싣는다. */
  let at = -1;

  function fail(msg: string): never {
    throw new Error(`L${at + 1}: ${msg}`);
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  function lets(lo: number, hi: number, top: boolean): string[] {
    const names: string[] = [];
    let i = lo;
    while (i < hi) {
      const s = lines[i]!.stmt;
      if (top && s.k === 'function') {
        i = bodyEnd(lines, i);
        continue;
      }
      if (s.k === 'assign' && s.declare === true) names.push(s.to);
      i += 1;
    }
    return names;
  }

  function push(fn: string, names: string[]): void {
    const slots = new Map<string, number>();
    for (const n of names) {
      slots.set(n, stackTop);
      stackTop += 1;
    }
    frames.push({ fn, slots });
  }

  function pop(): void {
    const f = frames.pop();
    if (!f) fail('걷을 틀이 없다');
    for (const a of f.slots.values()) {
      cells.delete(a);
      stackTop -= 1;
    }
  }

  function addrOf(name: string): number {
    const top = frames[frames.length - 1];
    const outer = frames[0];
    const a = top?.slots.get(name) ?? outer?.slots.get(name);
    if (a === undefined) fail(`이름이 없다: ${name}`);
    return a;
  }

  function get(name: string): Val {
    const v = cells.get(addrOf(name));
    if (!v) fail(`빈 칸을 읽었다: ${name}`);
    return v;
  }

  function snapFrame(f: Frame): FrameSnap {
    return {
      fn: f.fn,
      slots: [...f.slots].map(([name, addr]) => ({ name, addr, value: cells.get(addr) ?? null })),
    };
  }

  function snap(): { frames: FrameSnap[]; heap: CellSnap[]; out: Val[] } {
    return {
      frames: frames.map(snapFrame),
      heap: [...heap]
        .filter(([addr]) => [...blocks].some(([b, n]) => addr >= b && addr < b + n))
        .sort((x, y) => x[0] - y[0])
        .map(([addr, value]) => ({ addr, value })),
      out: out.slice(),
    };
  }

  function evalPure(e: Expr): Val {
    if ('num' in e) return { k: 'num', n: e.num };
    if ('null' in e) return { k: 'null' };
    if ('var' in e) return get(e.var);
    if ('op' in e) {
      if (e.op !== '+') fail(`모르는 연산: ${String(e.op)}`);
      const l = evalPure(e.l);
      const r = evalPure(e.r);
      if (l.k !== 'num' || r.k !== 'num') fail('수가 아닌 것을 더했다');
      return { k: 'num', n: l.n + r.n };
    }
    if (!('call' in e) || typeof e.call !== 'string' || !Array.isArray(e.args)) {
      fail(`모르는 식 모양: ${JSON.stringify(e)}`);
    }
    const arg = e.args[0];
    if (e.call === 'address') {
      if (!arg || !('var' in arg)) fail('address 는 이름을 받는다');
      return { k: 'addr', a: addrOf(arg.var) };
    }
    if (!arg) fail(`인자가 없다: ${e.call}`);
    if (e.call === 'allocate') {
      const n = evalPure(arg);
      if (n.k !== 'num') fail('allocate 는 칸 수를 받는다');
      // 이 프로그램은 돌려주는 줄이 없어 빈 자리 목록이 늘 비어 있다 — 새 땅 끝에서 뗀다
      const a = heapTop;
      heapTop += n.n;
      blocks.set(a, n.n);
      for (let c = a; c < a + n.n; c += 1) heap.set(c, null);
      lastAlloc = a;
      return { k: 'addr', a };
    }
    if (e.call === 'valueAt') {
      const p = evalPure(arg);
      if (p.k !== 'addr') fail('valueAt 은 주소를 받는다');
      const v = heap.has(p.a) ? heap.get(p.a) : cells.get(p.a);
      if (!v) fail(`빈 칸을 따라갔다: ${p.a}`);
      hops.push({ addr: p.a, value: v });
      return v;
    }
    fail(`해석하지 않는 부르기: ${e.call}`);
  }

  async function callUser(e: { call: string; args: Expr[] }): Promise<Outcome> {
    const fi = lines.findIndex((l) => l.stmt.k === 'function' && l.stmt.name === e.call);
    const head = lines[fi];
    if (!head || head.stmt.k !== 'function') fail(`함수가 없다: ${e.call}`);
    const params = head.stmt.params;
    if (e.args.length < params.length) {
      fail(`${e.call} 에 넘긴 인자 수 ${e.args.length} · 받는 인자 수 ${params.length}`);
    }
    const vals = e.args.map(evalPure);
    const lo = fi + 1;
    const hi = bodyEnd(lines, fi);
    push(e.call, [...params, ...lets(lo, hi, false)]);
    params.forEach((p, i) => {
      cells.set(addrOf(p), vals[i]!);
    });
    stood = true;
    return run(lo, hi);
  }

  async function run(lo: number, hi: number): Promise<Outcome> {
    let i = lo;
    while (i < hi) {
      if (ctx.cancelled) return { kind: 'stop' };
      const s = lines[i]!.stmt;
      if (s.k === 'function') {
        i = bodyEnd(lines, i);
        continue;
      }
      hops = [];
      lastAlloc = null;
      const line = i;
      at = i;
      if (s.k === 'assign' && isUserCall(s.value)) {
        const call = s.value;
        const args = call.args.map(evalPure);
        if (!(await pause())) return { kind: 'stop' };
        await ctx.emit({ type: 'call', payload: { line, fn: call.call, args, ...snap() } });
        const r = await callUser(call);
        at = line;
        if (r.kind === 'stop') return r;
        if (r.kind !== 'ret') fail(`${call.call} 의 몸이 return 없이 끝났다`);
        const value = r.value;
        const was = snapFrame(frames[frames.length - 1]!);
        pop();
        cells.set(addrOf(s.to), value);
        if (!(await pause())) return { kind: 'stop' };
        await ctx.emit({ type: 'finish', payload: { line, name: s.to, value, was, ...snap() } });
      } else if (s.k === 'assign') {
        const value = evalPure(s.value);
        cells.set(addrOf(s.to), value);
        const alloc = lastAlloc;
        const st = stood;
        stood = false;
        if (!(await pause())) return { kind: 'stop' };
        await ctx.emit({ type: 'assign', payload: { line, name: s.to, value, alloc, stood: st, ...snap() } });
      } else if (s.k === 'store') {
        const p = evalPure(s.addr);
        if (p.k !== 'addr') fail('주소가 아닌 곳에 넣었다');
        const value = evalPure(s.value);
        heap.set(p.a, value);
        const from = 'var' in s.value ? s.value.var : null;
        const st = stood;
        stood = false;
        if (!(await pause())) return { kind: 'stop' };
        await ctx.emit({ type: 'store', payload: { line, addr: p.a, value, from, stood: st, ...snap() } });
      } else if (s.k === 'show') {
        const value = evalPure(s.value);
        out.push(value);
        const st = stood;
        stood = false;
        if (!(await pause())) return { kind: 'stop' };
        await ctx.emit({ type: 'show', payload: { line, value, hops: hops.slice(), stood: st, ...snap() } });
      } else if (s.k === 'return') {
        const value = evalPure(s.value);
        const st = stood;
        stood = false;
        if (!(await pause())) return { kind: 'stop' };
        await ctx.emit({ type: 'return', payload: { line, value, stood: st, ...snap() } });
        return { kind: 'ret', value };
      } else {
        fail(`모르는 문: ${JSON.stringify(s)}`);
      }
      i += 1;
    }
    return { kind: 'done' };
  }

  push('', lets(0, lines.length, true));
  await ctx.emit({ type: 'init', silent: true, payload: snap() });
  await run(0, lines.length);
}
