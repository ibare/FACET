/**
 * 인스턴스화 — 클래스 하나에서 객체가 여럿 찍혀 나오고, 칸의 값은 객체마다 따로 산다.
 *
 * 1차 데이터는 줄 목록 `{ indent, text, stmt }` 이다. 알고리즘이 그 구조를 해석해
 * 찍힌 객체 · 바뀐 칸 · 출력을 셈한다. 걸음은 **맨 바깥 줄 하나** — 그 줄이 부른
 * `create` · `tick` 의 안쪽 줄은 그 걸음 안에서 일어난다.
 *
 * 이벤트
 * - `init` (silent) — 바탕. 걸음 0 의 장면을 갈아 끼운다.
 *   payload: {
 *     lines: { indent: number; text: string }[];
 *     classes: { name: string; fields: string[] }[];   // 필드는 조상 것까지, 선언 차례
 *     objectCount: number;                              // 프로그램이 끝까지 찍어 내는 객체 수 (자리 셈용)
 *   }
 * - `line` — 맨 바깥 줄 하나를 밟았다. 걸음 하나.
 *   payload: {
 *     line: number;            // 밟은 줄의 차례 (0 부터)
 *     inner: number[];         // 그 줄이 부른 몸 안에서 밟은 줄들 (차례대로)
 *     fx: Fx[];                // 일어난 일 (차례대로)
 *   }
 *   Fx =
 *     | { k: 'new'; obj: number; cls: string; fields: string[] }   // 칸은 모두 null 로 선다
 *     | { k: 'set'; obj: number; field: string; from: Val; to: Val }
 *     | { k: 'bind'; name: string; obj: number }                   // 이름이 객체를 가리키게 됐다
 *     | { k: 'show'; value: Val; src: { obj: number; field: string } | null }
 *   Val = number | string | boolean | null   (obj 는 찍힌 차례, 0 부터)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Val = number | string | boolean | null;

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { this: true }
  | { get: Expr; field: string }
  | { mcall: Expr; name: string; args: Expr[] }
  | { new: string; args: Expr[] }
  | { op: '+'; l: Expr; r: Expr };

export type Stmt =
  | { k: 'class'; name: string; extends?: string }
  | { k: 'field'; vis: 'public' | 'private'; name: string }
  | { k: 'function'; name: string; params: string[] }
  | { k: 'assign'; to: string | { obj: Expr; field: string }; value: Expr; declare?: boolean }
  | { k: 'show'; value: Expr }
  | { k: 'expr'; value: Expr };

export type Line = { indent: number; text: string; stmt: Stmt };

export type InstantiateFromClassFacetData = {
  type: 'instantiate-from-class';
  stepMs: number;
  lines: Line[];
};

export type Fx =
  | { k: 'new'; obj: number; cls: string; fields: string[] }
  | { k: 'set'; obj: number; field: string; from: Val; to: Val }
  | { k: 'bind'; name: string; obj: number }
  | { k: 'show'; value: Val; src: { obj: number; field: string } | null };

export type LineRecord = { line: number; inner: number[]; fx: Fx[] };

type ClassInfo = {
  name: string;
  parent: string | null;
  fields: string[];
  methods: Map<string, { params: string[]; body: number[] }>;
};

type ObjRef = { ref: number };
type Value = Val | ObjRef;

/** 줄 i 바로 아래 한 칸 깊은 줄들 (몸). */
function bodyOf(lines: Line[], i: number): number[] {
  const out: number[] = [];
  const base = lines[i].indent;
  for (let j = i + 1; j < lines.length; j += 1) {
    if (lines[j].indent <= base) break;
    if (lines[j].indent === base + 1) out.push(j);
  }
  return out;
}

function readClasses(lines: Line[]): Map<string, ClassInfo> {
  const classes = new Map<string, ClassInfo>();
  lines.forEach((ln, i) => {
    const st = ln.stmt;
    if (st.k !== 'class' || ln.indent !== 0) return;
    const info: ClassInfo = { name: st.name, parent: st.extends ?? null, fields: [], methods: new Map() };
    for (const j of bodyOf(lines, i)) {
      const m = lines[j].stmt;
      if (m.k === 'field') info.fields.push(m.name);
      else if (m.k === 'function') info.methods.set(m.name, { params: m.params, body: bodyOf(lines, j) });
    }
    classes.set(st.name, info);
  });
  return classes;
}

/** 조상부터 내려오며 선언한 필드 전부. */
function allFields(classes: Map<string, ClassInfo>, cls: string): string[] {
  const chain: ClassInfo[] = [];
  let c: string | null = cls;
  while (c !== null) {
    const info = classes.get(c);
    if (info === undefined) throw new Error(`클래스 ${c} 가 없다`);
    chain.unshift(info);
    c = info.parent;
  }
  return chain.flatMap((info) => info.fields);
}

function findMethod(
  classes: Map<string, ClassInfo>,
  cls: string,
  name: string,
): { params: string[]; body: number[] } | null {
  let c: string | null = cls;
  while (c !== null) {
    const info = classes.get(c);
    if (info === undefined) return null;
    const m = info.methods.get(name);
    if (m !== undefined) return m;
    c = info.parent;
  }
  return null;
}

function isRef(v: Value): v is ObjRef {
  return typeof v === 'object' && v !== null;
}

function plain(v: Value): Val {
  if (isRef(v)) throw new Error('객체를 칸 값 · 출력으로 쓰는 프로그램은 이 조각이 다루지 않는다');
  return v;
}

/**
 * 프로그램을 끝까지 해석해 맨 바깥 줄마다 일어난 일을 돌려준다.
 * 정의 줄(class · field · function)은 밟지 않는다 — 시작 전에 서 있다.
 */
export function interpret(lines: Line[]): { records: LineRecord[]; classes: Map<string, ClassInfo>; objectCount: number } {
  const classes = readClasses(lines);
  const objects: { cls: string; fields: Map<string, Val> }[] = [];
  const globals = new Map<string, Value>();
  const records: LineRecord[] = [];
  let cur: LineRecord | null = null;

  const evalExpr = (e: Expr, env: Map<string, Value>): Value => {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) {
      const v = env.get(e.var);
      if (v === undefined) throw new Error(`이름 ${e.var} 가 없다`);
      return v;
    }
    if ('this' in e) {
      const v = env.get('this');
      if (v === undefined) throw new Error('this 가 없는 자리다');
      return v;
    }
    if ('get' in e) {
      const o = evalExpr(e.get, env);
      if (!isRef(o)) throw new Error('객체가 아닌 것의 칸을 읽었다');
      return objects[o.ref].fields.get(e.field) ?? null;
    }
    if ('op' in e) {
      const l = plain(evalExpr(e.l, env));
      const r = plain(evalExpr(e.r, env));
      if (typeof l === 'number' && typeof r === 'number') return l + r;
      return String(l) + String(r);
    }
    if ('new' in e) {
      const args = e.args.map((a) => evalExpr(a, env));
      const fields = allFields(classes, e.new);
      const id = objects.length;
      objects.push({ cls: e.new, fields: new Map(fields.map((f) => [f, null])) });
      cur?.fx.push({ k: 'new', obj: id, cls: e.new, fields });
      const create = findMethod(classes, e.new, 'create');
      if (create !== null) invoke(create, { ref: id }, args);
      else if (args.length > 0) throw new Error('create 가 없으면 인자를 받지 않는다');
      return { ref: id };
    }
    // mcall
    const o = evalExpr(e.mcall, env);
    if (!isRef(o)) throw new Error('객체가 아닌 것에 메서드를 불렀다');
    const args = e.args.map((a) => evalExpr(a, env));
    const m = findMethod(classes, objects[o.ref].cls, e.name);
    if (m === null) throw new Error(`메서드 ${e.name} 가 없다`);
    invoke(m, o, args);
    return null;
  };

  const invoke = (m: { params: string[]; body: number[] }, self: ObjRef, args: Value[]): void => {
    const env = new Map<string, Value>();
    m.params.forEach((p, i) => env.set(p, args[i] ?? null));
    env.set('this', self);
    for (const j of m.body) {
      cur?.inner.push(j);
      exec(j, env);
    }
  };

  const exec = (i: number, env: Map<string, Value>): void => {
    const st = lines[i].stmt;
    if (st.k === 'assign') {
      const v = evalExpr(st.value, env);
      if (typeof st.to === 'string') {
        env.set(st.to, v);
        if (isRef(v)) cur?.fx.push({ k: 'bind', name: st.to, obj: v.ref });
        return;
      }
      const o = evalExpr(st.to.obj, env);
      if (!isRef(o)) throw new Error('객체가 아닌 것의 칸에 넣었다');
      const cell = objects[o.ref].fields;
      const from = cell.get(st.to.field) ?? null;
      const to = plain(v);
      cell.set(st.to.field, to);
      cur?.fx.push({ k: 'set', obj: o.ref, field: st.to.field, from, to });
      return;
    }
    if (st.k === 'show') {
      const v = plain(evalExpr(st.value, env));
      let src: { obj: number; field: string } | null = null;
      if ('get' in st.value) {
        const o = evalExpr(st.value.get, env);
        if (isRef(o)) src = { obj: o.ref, field: st.value.field };
      }
      cur?.fx.push({ k: 'show', value: v, src });
      return;
    }
    if (st.k === 'expr') {
      evalExpr(st.value, env);
      return;
    }
    throw new Error(`줄 ${i} 는 밟을 수 없는 줄이다`);
  };

  lines.forEach((ln, i) => {
    if (ln.indent !== 0) return;
    const k = ln.stmt.k;
    if (k === 'class' || k === 'field' || k === 'function') return;
    cur = { line: i, inner: [], fx: [] };
    exec(i, globals);
    records.push(cur);
    cur = null;
  });

  return { records, classes, objectCount: objects.length };
}

export async function instantiateFromClass(
  rawCtx: FacetContext<InstantiateFromClassFacetData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<InstantiateFromClassFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const { records, classes, objectCount } = interpret(lines);

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      lines: lines.map((ln) => ({ indent: ln.indent, text: ln.text })),
      classes: [...classes.values()].map((c) => ({ name: c.name, fields: allFields(classes, c.name) })),
      objectCount,
    },
  });

  // 걸음 0 은 프로그램 전체가 선 화면이라 읽을 틈을 먼저 둔다.
  for (const rec of records) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'line',
      payload: { line: rec.line, inner: [...rec.inner], fx: rec.fx.map((f) => ({ ...f })) },
    });
  }
}
