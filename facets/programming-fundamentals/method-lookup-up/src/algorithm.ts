/**
 * method-lookup-up — 부른 메서드를 받는 객체의 클래스부터 부모로 한 층씩 거슬러 올라가 찾는다.
 *
 * 줄 목록(`lines`)의 구조를 해석해 걸음을 셈한다. 걸음표를 손으로 적지 않는다 —
 * 들여다본 클래스 · 찾은 층 · 돈 몸 · 출력은 모두 이 해석의 결과다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *
 * - `init`   — 걸음 0. 프로그램 전체가 선다. 아무것도 돌지 않았다.
 *   payload `{ lines: { indent: number; text: string }[];
 *              classes: { name: string; parent: string | null; first: number; last: number;
 *                         methods: { name: string; line: number }[] }[] }`
 *   줄 번호는 모두 0 부터 센 `lines` 의 자리다.
 *
 * - `create` — 맨 바깥의 `let x = new C()` 한 줄. 객체가 선다.
 *   payload `{ line: number; name: string; cls: string }`
 *
 * - `look`   — 부름 하나에서 클래스 하나를 들여다본다. 부르는 줄의 첫 `look` 이 곧 그 줄의 걸음이다.
 *   payload `{ line: number;        // 부르는 줄
 *              method: string;
 *              cls: string;         // 들여다본 클래스
 *              found: boolean;      // 그 클래스 몸 안에 같은 이름의 function 줄이 있는가
 *              methodLine: number;  // 찾았으면 그 function 줄, 못 찾았으면 -1
 *              depth: number;       // 이 부름에서 몇 번째 들여다봄인가 (0 = 받는 객체의 클래스)
 *              from: string | null; // 바로 앞에 들여다본 클래스 (0 번째면 null — 객체에서 출발)
 *              shadowed: { cls: string; line: number }[] }`
 *              // 찾은 층보다 위에 같은 이름이 또 있는 자리 (들여다보지 않는다). 못 찾았으면 빈 목록
 *
 * - `run`    — 찾은 몸의 줄 하나가 돈다. `show` 의 출력은 이 걸음 안이다.
 *   payload `{ line: number; cls: string; method: string; output: string }`
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
  | { k: 'class'; name: string; extends?: string; implements?: string }
  | { k: 'function'; name: string; params: string[]; vis?: string }
  | { k: 'field'; vis: string; name: string }
  | { k: 'show'; value: Expr }
  | { k: 'assign'; to: string | { obj: Expr; field: string }; value: Expr; declare?: boolean }
  | { k: 'expr'; value: Expr }
  | { k: 'return'; value: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type MethodLookupUpFacetData = {
  type: 'method-lookup-up';
  stepMs: number;
  lines: CodeLine[];
};

type MethodDef = { name: string; line: number; body: number[] };
type ClassDef = {
  name: string;
  parent: string | null;
  first: number;
  last: number;
  methods: MethodDef[];
};
type Obj = { cls: string };
type Value = string | number | boolean | null | Obj | Value[];

/** 들여쓰기로 클래스 · 메서드 · 몸 · 맨 바깥 문을 가른다. */
function readTree(lines: CodeLine[]): { classes: ClassDef[]; top: number[] } {
  const classes: ClassDef[] = [];
  const top: number[] = [];
  let cls: ClassDef | null = null;
  let method: MethodDef | null = null;
  lines.forEach((ln, i) => {
    const s = ln.stmt;
    if (ln.indent === 0) {
      method = null;
      if (s.k === 'class') {
        cls = { name: s.name, parent: s.extends ?? null, first: i, last: i, methods: [] };
        classes.push(cls);
      } else {
        cls = null;
        top.push(i);
      }
      return;
    }
    if (!cls) throw new Error(`L${i + 1}: 클래스 밖의 들여쓴 줄은 이 조각이 다루지 않는다`);
    const owner: ClassDef = cls;
    owner.last = i;
    if (ln.indent === 1) {
      if (s.k === 'function') {
        method = { name: s.name, line: i, body: [] };
        owner.methods.push(method);
      } else {
        method = null;
      }
      return;
    }
    if (!method) throw new Error(`L${i + 1}: 메서드 밖의 몸 줄`);
    const m: MethodDef = method;
    m.body.push(i);
  });
  return { classes, top };
}

/** 찾은 층보다 위(조상)에서 같은 이름을 가진 자리. */
function shadowedAbove(
  byName: Map<string, ClassDef>,
  from: string | null,
  name: string,
): { cls: string; line: number }[] {
  const out: { cls: string; line: number }[] = [];
  let c = from;
  while (c !== null) {
    const def = byName.get(c);
    if (!def) break;
    const m = def.methods.find((x) => x.name === name);
    if (m) out.push({ cls: def.name, line: m.line });
    c = def.parent;
  }
  return out;
}

function shown(v: Value): string {
  if (v === null) return 'null';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(shown).join(', ')}]`;
  return v.cls;
}

export async function methodLookupUp(
  context: FacetContext<MethodLookupUpFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<MethodLookupUpFacetData>;
  const { lines, stepMs } = ctx.data;
  const { classes, top } = readTree(lines);
  const byName = new Map(classes.map((c) => [c.name, c] as const));
  const vars = new Map<string, Value>();

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  /** 식을 셈한다. 메서드 부르기는 걸음을 낳으므로 비동기다. 취소되면 undefined. */
  async function evaluate(e: Expr, self: Obj | null, site: number): Promise<Value | undefined> {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) {
      if (!vars.has(e.var)) throw new Error(`이름 ${e.var} 이 선언되지 않았다`);
      return vars.get(e.var) ?? null;
    }
    if ('this' in e) return self;
    if ('mcall' in e) {
      const recv = await evaluate(e.mcall, self, site);
      if (recv === undefined) return undefined;
      if (recv === null || typeof recv !== 'object' || Array.isArray(recv)) {
        throw new Error(`L${site + 1}: 객체가 아닌 것의 메서드를 불렀다`);
      }
      return invoke(recv, e.name, site);
    }
    if ('op' in e) {
      const l = await evaluate(e.l, self, site);
      if (l === undefined) return undefined;
      const r = await evaluate(e.r, self, site);
      if (r === undefined) return undefined;
      if (e.op === '+' && typeof l === 'number' && typeof r === 'number') return l + r;
      if (e.op === '+') return shown(l) + shown(r);
      throw new Error(`연산 ${e.op} 은 이 조각이 다루지 않는다`);
    }
    throw new Error(`L${site + 1}: 이 조각이 다루지 않는 식`);
  }

  /**
   * 받는 객체의 클래스에서 출발해 부모로 한 층씩 올라가며 처음 찾은 몸을 부른다.
   * 앞 부름에서 찾은 층을 기억하지 않는다 — 늘 받는 객체의 클래스에서 시작한다.
   */
  async function invoke(recv: Obj, name: string, site: number): Promise<Value | undefined> {
    let c: string | null = recv.cls;
    let from: string | null = null;
    let depth = 0;
    while (c !== null) {
      if (!(await pause())) return undefined;
      const def = byName.get(c);
      if (!def) throw new Error(`클래스 ${c} 가 없다`);
      const m = def.methods.find((x) => x.name === name);
      await ctx.emit({
        type: 'look',
        payload: {
          line: site,
          method: name,
          cls: def.name,
          found: m !== undefined,
          methodLine: m ? m.line : -1,
          depth,
          from,
          shadowed: m ? shadowedAbove(byName, def.parent, name) : [],
        },
      });
      if (m) return runBody(recv, def, m);
      from = def.name;
      c = def.parent;
      depth += 1;
    }
    throw new Error(`L${site + 1}: ${name} 을 어느 층에서도 찾지 못했다`);
  }

  async function runBody(self: Obj, def: ClassDef, m: MethodDef): Promise<Value | undefined> {
    for (const i of m.body) {
      if (!(await pause())) return undefined;
      const s = lines[i].stmt;
      if (s.k !== 'show') throw new Error(`L${i + 1}: 몸 안의 ${s.k} 은 이 조각이 다루지 않는다`);
      const v = await evaluate(s.value, self, i);
      if (v === undefined) return undefined;
      await ctx.emit({
        type: 'run',
        payload: { line: i, cls: def.name, method: m.name, output: shown(v) },
      });
    }
    return null;
  }

  // 걸음 0 — 프로그램 전체가 선다. 문 밖에 둔다 (마운트 직후 빈 화면을 두지 않는다).
  await ctx.emit({
    type: 'init',
    payload: {
      lines: lines.map((ln) => ({ indent: ln.indent, text: ln.text })),
      classes: classes.map((c) => ({
        name: c.name,
        parent: c.parent,
        first: c.first,
        last: c.last,
        methods: c.methods.map((m) => ({ name: m.name, line: m.line })),
      })),
    },
  });

  for (const i of top) {
    if (ctx.cancelled) return;
    const s = lines[i].stmt;
    if (s.k === 'assign' && typeof s.to === 'string' && 'new' in s.value) {
      const cls = s.value.new;
      const def = byName.get(cls);
      if (!def) throw new Error(`L${i + 1}: 클래스 ${cls} 가 없다`);
      if (shadowedAbove(byName, cls, 'create').length > 0) {
        throw new Error(`L${i + 1}: create 가 있는 클래스는 이 조각이 다루지 않는다`);
      }
      if (!(await pause())) return;
      const obj: Obj = { cls };
      vars.set(s.to, obj);
      await ctx.emit({ type: 'create', payload: { line: i, name: s.to, cls } });
    } else if (s.k === 'expr') {
      const v = await evaluate(s.value, null, i);
      if (v === undefined) return;
    } else {
      throw new Error(`L${i + 1}: 맨 바깥의 ${s.k} 은 이 조각이 다루지 않는다`);
    }
  }
}
