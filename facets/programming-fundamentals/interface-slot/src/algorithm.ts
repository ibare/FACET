/**
 * interface-slot — 약속의 빈칸에 구현의 몸이 꽂히고, 갈아 끼워진다.
 *
 * 줄 구조(`lines`)를 해석한다. 글자는 파싱하지 않는다 — `stmt` 만 읽는다.
 * 정의 줄(`interface` · `signature` · `class` · `function`)은 밟지 않고, 맨 바깥의 나머지 줄을
 * 차례로 돌린다. 걸음은 **꽂기 걸음**이다.
 *
 *  - 꽂음 — 함수에 넘긴 인자가 약속을 채운 클래스의 객체면, 약속의 서명마다 그 클래스의 같은 이름 몸이 칸에 든다.
 *    칸 전부가 한 걸음에 찬다
 *  - 약속으로 부름 — 그 함수 몸의 `x.m()` 한 줄. 칸에 꽂힌 몸이 돌고, 몸의 `show` 출력은 같은 걸음 안이다
 *
 * 이벤트 (모두 silent 아님 — 한 발신이 한 걸음이다):
 *
 *  - `init`  걸음 0. 바탕.
 *    payload: {
 *      lines: { indent: number; text: string }[]
 *      iface: { name: string; line: number; sigs: { name: string; line: number }[] }
 *      impls: { cls: string; line: number; methods: { sig: string; line: number; body: number[] }[] }[]
 *      fn:    { name: string; line: number; params: string[]; body: number[] }
 *      sites: number[]            — 맨 바깥에서 밟는 줄
 *    }
 *    줄 번호는 모두 `lines` 의 0 부터 센 자리다. `methods` 는 약속의 서명 차례다.
 *  - `plug`  꽂음. payload: { site: number; cls: string }
 *  - `call`  약속으로 부름. payload: { line: number; method: string; cls: string; body: number[]; outs: string[] }
 *    `body` 는 이번에 돈 몸의 줄, `outs` 는 그 몸이 보인 값.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { this: true }
  | { get: Expr; field: string }
  | { mcall: Expr; name: string; args: Expr[] }
  | { call: string; args: Expr[] }
  | { new: string; args: Expr[] }
  | { op: string; l: Expr; r: Expr }
  | { list: Expr[] };

export type Stmt =
  | { k: 'interface'; name: string }
  | { k: 'signature'; name: string; params: string[] }
  | { k: 'class'; name: string; extends?: string; implements?: string }
  | { k: 'function'; name: string; params: string[]; vis?: string }
  | { k: 'show'; value: Expr }
  | { k: 'expr'; value: Expr };

export type Line = { indent: number; text: string; stmt: Stmt };

export type InterfaceSlotFacetData = {
  type: 'interface-slot';
  stepMs: number;
  lines: Line[];
};

type Obj = { cls: string };
type Value = number | string | Obj | null;

type ClassDef = {
  name: string;
  line: number;
  parent: string | null;
  implements: string | null;
  methods: Map<string, { line: number; params: string[]; body: number[] }>;
};

/** 줄마다 몸(바로 아래 한 칸 깊은 줄들)을 모은다. */
function childrenOf(lines: Line[], at: number): number[] {
  const out: number[] = [];
  const base = lines[at]!.indent;
  for (let i = at + 1; i < lines.length; i += 1) {
    const ind = lines[i]!.indent;
    if (ind <= base) break;
    if (ind === base + 1) out.push(i);
  }
  return out;
}

function show(v: Value): string {
  if (v === null) return 'null';
  if (typeof v === 'object') return v.cls;
  return String(v);
}

export async function interfaceSlot(ctx0: FacetContext<InterfaceSlotFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<InterfaceSlotFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // ---- 구조 읽기 (정의 줄은 시작 전에 서 있다)
  const top: number[] = [];
  for (let i = 0; i < lines.length; i += 1) if (lines[i]!.indent === 0) top.push(i);

  const ifaces = new Map<string, { line: number; sigs: { name: string; line: number; params: number }[] }>();
  const classes = new Map<string, ClassDef>();
  const funcs = new Map<string, { line: number; params: string[]; body: number[] }>();
  const sites: number[] = [];

  for (const i of top) {
    const st = lines[i]!.stmt;
    if (st.k === 'interface') {
      const sigs = childrenOf(lines, i).flatMap((j) => {
        const s = lines[j]!.stmt;
        return s.k === 'signature' ? [{ name: s.name, line: j, params: s.params.length }] : [];
      });
      ifaces.set(st.name, { line: i, sigs });
    } else if (st.k === 'class') {
      const methods = new Map<string, { line: number; params: string[]; body: number[] }>();
      for (const j of childrenOf(lines, i)) {
        const s = lines[j]!.stmt;
        if (s.k === 'function') methods.set(s.name, { line: j, params: s.params, body: childrenOf(lines, j) });
      }
      classes.set(st.name, {
        name: st.name,
        line: i,
        parent: st.extends ?? null,
        implements: st.implements ?? null,
        methods,
      });
    } else if (st.k === 'function') {
      funcs.set(st.name, { line: i, params: st.params, body: childrenOf(lines, i) });
    } else {
      sites.push(i);
    }
  }

  // ---- 약속을 채웠는가 (실행 전 확인). 약속의 서명 차례로 몸을 짝짓는다
  const ifaceEntry = [...ifaces.entries()][0];
  if (ifaceEntry === undefined) return;
  const [ifaceName, iface] = ifaceEntry;
  const impls: { cls: string; line: number; methods: { sig: string; line: number; body: number[] }[] }[] = [];
  for (const c of classes.values()) {
    if (c.implements !== ifaceName) continue;
    const methods = iface.sigs.flatMap((sig) => {
      const m = c.methods.get(sig.name);
      return m !== undefined && m.params.length === sig.params ? [{ sig: sig.name, line: m.line, body: m.body }] : [];
    });
    if (methods.length !== iface.sigs.length) throw new Error(`${c.name} does not fulfil ${ifaceName}`);
    impls.push({ cls: c.name, line: c.line, methods });
  }

  const fnEntry = [...funcs.entries()][0];
  if (fnEntry === undefined) return;
  const [fnName, fnDef] = fnEntry;

  function findMethod(cls: string, name: string) {
    let c = classes.get(cls);
    while (c !== undefined) {
      const m = c.methods.get(name);
      if (m !== undefined) return m;
      c = c.parent === null ? undefined : classes.get(c.parent);
    }
    return undefined;
  }

  // ---- 몸 안의 셈 (걸음을 만들지 않는다 — 부름 걸음 하나에 들어간다)
  function evalExpr(e: Expr, env: Map<string, Value>, outs: string[], ran: number[]): Value {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) return env.get(e.var) ?? null;
    if ('new' in e) return { cls: e.new };
    if ('op' in e) {
      const l = evalExpr(e.l, env, outs, ran);
      const r = evalExpr(e.r, env, outs, ran);
      if (e.op === '+') return typeof l === 'number' && typeof r === 'number' ? l + r : show(l) + show(r);
      return null;
    }
    if ('mcall' in e) {
      const recv = evalExpr(e.mcall, env, outs, ran);
      if (recv === null || typeof recv !== 'object') return null;
      const m = findMethod(recv.cls, e.name);
      if (m === undefined) return null;
      const inner = new Map<string, Value>();
      m.params.forEach((p, k) => inner.set(p, evalExpr(e.args[k]!, env, outs, ran)));
      runBody(m.body, inner, outs, ran);
      return null;
    }
    return null;
  }

  function runBody(body: number[], env: Map<string, Value>, outs: string[], ran: number[]): void {
    for (const j of body) {
      const st = lines[j]!.stmt;
      ran.push(j);
      if (st.k === 'show') outs.push(show(evalExpr(st.value, env, outs, ran)));
      else if (st.k === 'expr') evalExpr(st.value, env, outs, ran);
    }
  }

  await ctx.emit({
    type: 'init',
    payload: {
      lines: lines.map((l) => ({ indent: l.indent, text: l.text })),
      iface: { name: ifaceName, line: iface.line, sigs: iface.sigs.map((s) => ({ name: s.name, line: s.line })) },
      impls,
      fn: { name: fnName, line: fnDef.line, params: fnDef.params, body: fnDef.body },
      sites,
    },
  });

  // ---- 맨 바깥 줄을 차례로
  for (const site of sites) {
    if (ctx.cancelled) return;
    const st = lines[site]!.stmt;
    if (st.k !== 'expr' || !('call' in st.value)) continue;
    const callee = funcs.get(st.value.call);
    if (callee === undefined) continue;
    const env = new Map<string, Value>();
    const args = st.value.args;
    callee.params.forEach((p, k) => env.set(p, evalExpr(args[k]!, new Map(), [], [])));

    // 꽂음 — 넘긴 객체의 클래스가 약속을 채웠으면 칸 전부가 그 몸으로 찬다
    for (const v of env.values()) {
      if (ctx.cancelled) return;
      if (v === null || typeof v !== 'object') continue;
      if (!impls.some((im) => im.cls === v.cls)) continue;
      if (!(await pause())) return;
      await ctx.emit({ type: 'plug', payload: { site, cls: v.cls } });
    }

    // 약속으로 부름 — 함수 몸의 줄마다 한 걸음
    for (const j of callee.body) {
      if (ctx.cancelled) return;
      const bst = lines[j]!.stmt;
      if (bst.k !== 'expr' || !('mcall' in bst.value)) continue;
      const recv = evalExpr(bst.value.mcall, env, [], []);
      if (recv === null || typeof recv !== 'object') continue;
      const outs: string[] = [];
      const ran: number[] = [];
      evalExpr(bst.value, env, outs, ran);
      if (!(await pause())) return;
      await ctx.emit({
        type: 'call',
        payload: { line: j, method: bst.value.name, cls: recv.cls, body: ran, outs },
      });
    }
  }
}
