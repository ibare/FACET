/**
 * 동적 디스패치 — 같은 부르는 줄 하나가 부를 때마다 받는 객체의 클래스에 있는 몸으로 간다.
 *
 * 줄 구조(`lines`)를 해석해 돈다. 걸음표를 손으로 적지 않는다 — 밟는 차례 · 받은 객체 ·
 * 찾아 들어간 몸 · 돌려준 값은 전부 이 해석이 셈한다. 정의 줄(`class` · `function`)은 밟지 않는다.
 *
 * 걸음 단위는 **부름 걸음**이다 — 걸음 0 시작 · 목록이 서는 걸음 · 한 바퀴마다
 * 부름 → 몸의 돌려줌 → 같은 줄로 돌아와 출력. `for each` 머리줄은 따로 걸음으로 세지 않는다.
 *
 * 걸음 0 의 바탕(줄 목록 · 클래스 몸의 자리)은 장면이 `initialData` 에서 베껴 세운다 — 발신하지 않는다.
 * 클래스 몸의 자리는 `classSpans` 하나로 셈해 해석과 장면이 같은 것을 본다.
 *
 * 이벤트
 * - `build` — 목록을 세우는 줄이 돌았다.
 *   payload `{ line: number; name: string; items: { obj: number; cls: string; from: number; to: number }[] }`
 *   `from`·`to` 는 그 줄 글자 안에서 `new …()` 가 차지한 칸(끝은 제외).
 * - `call` — 부르는 줄이 한 객체를 받아 몸으로 간다.
 *   payload `{ line: number; recv: string; obj: number; cls: string; method: string; owner: string; body: number; looked: number }`
 *   `recv` 는 받는 쪽 식의 글자(`item`).
 *   `owner` 는 몸을 찾은 클래스, `body` 는 그 메서드 줄, `looked` 는 들여다본 클래스 수.
 * - `return` — 몸의 돌려줌 줄이 값을 돌려준다. payload `{ line: number; value: string }` (코드 글자 꼴의 값)
 * - `show` — 부르는 줄로 돌아와 값을 보인다. payload `{ line: number; shown: string }` (출력된 글자)
 * - `done` (silent) — 프로그램이 끝났다. payload 없음.
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
  | { k: 'assign'; to: string; value: Expr; declare?: boolean }
  | { k: 'show'; value: Expr }
  | { k: 'return'; value: Expr }
  | { k: 'expr'; value: Expr }
  | { k: 'for-each'; var: string; in: Expr };

export type ProgramLine = { indent: number; text: string; stmt: Stmt };

export type DynamicDispatchFacetData = {
  type: 'dynamic-dispatch';
  stepMs: number;
  lines: ProgramLine[];
};

type Obj = { id: number; cls: string };
type Value = number | string | boolean | null | Obj | Value[];

type Method = { name: string; params: string[]; line: number; body: number[] };
type ClassInfo = { name: string; parent: string | null; from: number; to: number; methods: Method[] };

type Outcome = { kind: 'normal' } | { kind: 'return'; value: Value; line: number } | { kind: 'stop' };
const NORMAL: Outcome = { kind: 'normal' };
const STOP: Outcome = { kind: 'stop' };

// ---------------------------------------------------------------- 글자 찍기 (구조와 글자 대조)

function exprText(e: Expr): string {
  if ('num' in e) return String(e.num);
  if ('str' in e) return `"${e.str}"`;
  if ('var' in e) return e.var;
  if ('this' in e) return 'this';
  if ('get' in e) return `${exprText(e.get)}.${e.field}`;
  if ('mcall' in e) return `${exprText(e.mcall)}.${e.name}(${e.args.map(exprText).join(', ')})`;
  if ('call' in e) return `${e.call}(${e.args.map(exprText).join(', ')})`;
  if ('new' in e) return `new ${e.new}(${e.args.map(exprText).join(', ')})`;
  if ('op' in e) return `${exprText(e.l)} ${e.op} ${exprText(e.r)}`;
  return `[${e.list.map(exprText).join(', ')}]`;
}

function assignHead(s: { to: string; declare?: boolean }): string {
  return `${s.declare === true ? 'let ' : ''}${s.to} = `;
}

function stmtText(s: Stmt): string {
  switch (s.k) {
    case 'class':
      return `class ${s.name}${s.extends ? ` extends ${s.extends}` : ''}${s.implements ? ` implements ${s.implements}` : ''}`;
    case 'function':
      return `${s.vis ? `${s.vis} ` : ''}function ${s.name}(${s.params.join(', ')})`;
    case 'assign':
      return assignHead(s) + exprText(s.value);
    case 'show':
      return `show ${exprText(s.value)}`;
    case 'return':
      return `return ${exprText(s.value)}`;
    case 'expr':
      return exprText(s.value);
    case 'for-each':
      return `for each ${s.var} in ${exprText(s.in)}`;
  }
}

// ---------------------------------------------------------------- 구조 읽기

/** `at` 줄 아래로 들여쓰기가 더 깊은 줄들 — 그 줄의 몸. */
function bodyOf(lines: { indent: number }[], at: number): number[] {
  const out: number[] = [];
  for (let i = at + 1; i < lines.length && lines[i].indent > lines[at].indent; i += 1) out.push(i);
  return out;
}

/** 몸 안에서 바로 아래 층의 줄만 — 실행 차례의 단위. */
function topOf(lines: { indent: number }[], block: number[]): number[] {
  if (block.length === 0) return [];
  const level = Math.min(...block.map((i) => lines[i].indent));
  return block.filter((i) => lines[i].indent === level);
}

/** 클래스 몸의 자리 — 모양만 보는 줄. 장면도 같은 함수로 바탕을 세운다. */
export type ShapeLine = { indent: number; stmt: { k: string; name?: string; extends?: string } };
export type ClassSpan = {
  name: string;
  parent: string | null;
  from: number;
  to: number;
  methods: { name: string; line: number }[];
};

export function classSpans(lines: ShapeLine[]): ClassSpan[] {
  const out: ClassSpan[] = [];
  lines.forEach((ln, i) => {
    if (ln.stmt.k !== 'class' || ln.stmt.name === undefined) return;
    const body = bodyOf(lines, i);
    const methods: { name: string; line: number }[] = [];
    for (const j of topOf(lines, body)) {
      const m = lines[j].stmt;
      if (m.k === 'function' && m.name !== undefined) methods.push({ name: m.name, line: j });
    }
    out.push({
      name: ln.stmt.name,
      parent: ln.stmt.extends ?? null,
      from: i,
      to: body.length > 0 ? body[body.length - 1] : i,
      methods,
    });
  });
  return out;
}

function readClasses(lines: ProgramLine[]): ClassInfo[] {
  return classSpans(lines).map((c) => ({
    name: c.name,
    parent: c.parent,
    from: c.from,
    to: c.to,
    methods: c.methods.map((m) => {
      const st = lines[m.line].stmt;
      return { name: m.name, params: st.k === 'function' ? st.params : [], line: m.line, body: bodyOf(lines, m.line) };
    }),
  }));
}

function fmtCode(v: Value): string {
  if (typeof v === 'string') return `"${v}"`;
  if (v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(fmtCode).join(', ')}]`;
  if (typeof v === 'object') return `${v.cls} object`;
  return String(v);
}

function fmtShown(v: Value): string {
  return typeof v === 'string' ? v : fmtCode(v);
}

function isObj(v: Value): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------- 해석

export async function dynamicDispatch(ctx: FacetContext<DynamicDispatchFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<DynamicDispatchFacetData>;
  const { lines, stepMs } = rc.data;

  lines.forEach((ln, i) => {
    if (stmtText(ln.stmt) !== ln.text) {
      throw new Error(`dynamic-dispatch: 줄 ${i + 1} 의 글자와 구조가 어긋난다 — "${ln.text}" / "${stmtText(ln.stmt)}"`);
    }
  });

  const classes = readClasses(lines);
  const byName = new Map(classes.map((c) => [c.name, c]));
  let nextId = 0;

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  /** 받는 객체의 클래스에서 찾고, 없으면 부모로 한 층씩 오른다. */
  function lookup(cls: string, name: string, line: number): { owner: ClassInfo; method: Method; looked: number } {
    let looked = 0;
    let at: ClassInfo | undefined = byName.get(cls);
    while (at !== undefined) {
      looked += 1;
      const found = at.methods.find((m) => m.name === name);
      if (found !== undefined) return { owner: at, method: found, looked };
      at = at.parent === null ? undefined : byName.get(at.parent);
    }
    throw new Error(`dynamic-dispatch: 줄 ${line + 1} — ${cls} 에서 ${name} 을 찾지 못했다`);
  }

  type Env = Map<string, Value>;
  type Frame = { env: Env; self: Obj | null };

  /** 식을 셈한다. 부르기를 만나면 걸음을 내고 몸을 돈다 — 취소면 null. */
  async function evalExpr(e: Expr, frame: Frame, line: number): Promise<{ v: Value } | null> {
    if ('num' in e) return { v: e.num };
    if ('str' in e) return { v: e.str };
    if ('var' in e) {
      if (!frame.env.has(e.var)) throw new Error(`dynamic-dispatch: 줄 ${line + 1} — 이름 ${e.var} 이 없다`);
      return { v: frame.env.get(e.var) ?? null };
    }
    if ('this' in e) {
      if (frame.self === null) throw new Error(`dynamic-dispatch: 줄 ${line + 1} — 메서드 몸 밖에서 this 를 썼다`);
      return { v: frame.self };
    }
    if ('new' in e) {
      if (!byName.has(e.new)) throw new Error(`dynamic-dispatch: 줄 ${line + 1} — 클래스 ${e.new} 이 없다`);
      // 이 조각은 create 를 부르지 않는다 — 인자나 create 가 있으면 셈하지 않은 채 넘어가지 않고 멈춘다
      if (e.args.length > 0) {
        throw new Error(`dynamic-dispatch: 줄 ${line + 1} — new ${e.new}(…) 의 인자를 이 조각은 셈하지 않는다`);
      }
      for (let at = byName.get(e.new); at !== undefined; at = at.parent === null ? undefined : byName.get(at.parent)) {
        if (at.methods.some((m) => m.name === 'create')) {
          throw new Error(`dynamic-dispatch: 줄 ${line + 1} — ${at.name}.create 를 이 조각은 부르지 않는다`);
        }
      }
      const obj: Obj = { id: nextId, cls: e.new };
      nextId += 1;
      return { v: obj };
    }
    if ('list' in e) {
      const out: Value[] = [];
      for (const item of e.list) {
        if (rc.cancelled) return null;
        const r = await evalExpr(item, frame, line);
        if (r === null) return null;
        out.push(r.v);
      }
      return { v: out };
    }
    if ('mcall' in e) {
      const recv = await evalExpr(e.mcall, frame, line);
      if (recv === null) return null;
      if (!isObj(recv.v)) throw new Error(`dynamic-dispatch: 줄 ${line + 1} — 객체가 아닌 것에 메서드를 불렀다`);
      const found = lookup(recv.v.cls, e.name, line);
      if (e.args.length !== found.method.params.length) {
        throw new Error(
          `dynamic-dispatch: 줄 ${line + 1} — ${found.owner.name}.${e.name} 의 매개변수 ${found.method.params.length} · 넘긴 인자 ${e.args.length}`,
        );
      }
      const env: Env = new Map();
      for (let a = 0; a < found.method.params.length; a += 1) {
        if (rc.cancelled) return null;
        const r = await evalExpr(e.args[a], frame, line);
        if (r === null) return null;
        env.set(found.method.params[a], r.v);
      }
      if (!(await pause())) return null;
      await rc.emit({
        type: 'call',
        payload: {
          line,
          recv: exprText(e.mcall),
          obj: recv.v.id,
          cls: recv.v.cls,
          method: e.name,
          owner: found.owner.name,
          body: found.method.line,
          looked: found.looked,
        },
      });
      const out = await execBlock(topOf(lines, found.method.body), { env, self: recv.v });
      if (out.kind === 'stop') return null;
      return { v: out.kind === 'return' ? out.value : null };
    }
    throw new Error(`dynamic-dispatch: 줄 ${line + 1} — 이 조각이 셈하지 않는 식: ${exprText(e)}`);
  }

  async function execBlock(block: number[], frame: Frame): Promise<Outcome> {
    for (const i of block) {
      if (rc.cancelled) return STOP;
      const s = lines[i].stmt;
      if (s.k === 'class' || s.k === 'function') continue;
      if (s.k === 'assign') {
        const r = await evalExpr(s.value, frame, i);
        if (r === null) return STOP;
        frame.env.set(s.to, r.v);
        if ('list' in s.value && Array.isArray(r.v)) {
          const head = assignHead(s).length + 1;
          let col = head;
          const items: { obj: number; cls: string; from: number; to: number }[] = [];
          s.value.list.forEach((item, k) => {
            const text = exprText(item);
            const v = Array.isArray(r.v) ? r.v[k] : null;
            if (isObj(v)) items.push({ obj: v.id, cls: v.cls, from: col, to: col + text.length });
            col += text.length + 2;
          });
          if (!(await pause())) return STOP;
          await rc.emit({ type: 'build', payload: { line: i, name: s.to, items } });
        }
        continue;
      }
      if (s.k === 'for-each') {
        const r = await evalExpr(s.in, frame, i);
        if (r === null) return STOP;
        if (!Array.isArray(r.v)) throw new Error(`dynamic-dispatch: 줄 ${i + 1} — for each 가 목록이 아닌 것을 돈다`);
        const body = topOf(lines, bodyOf(lines, i));
        for (const item of r.v) {
          if (rc.cancelled) return STOP;
          frame.env.set(s.var, item);
          const out = await execBlock(body, frame);
          if (out.kind !== 'normal') return out;
        }
        continue;
      }
      if (s.k === 'show') {
        const r = await evalExpr(s.value, frame, i);
        if (r === null) return STOP;
        if (!(await pause())) return STOP;
        await rc.emit({ type: 'show', payload: { line: i, shown: fmtShown(r.v) } });
        continue;
      }
      if (s.k === 'return') {
        const r = await evalExpr(s.value, frame, i);
        if (r === null) return STOP;
        if (!(await pause())) return STOP;
        await rc.emit({ type: 'return', payload: { line: i, value: fmtCode(r.v) } });
        return { kind: 'return', value: r.v, line: i };
      }
      const r = await evalExpr(s.value, frame, i);
      if (r === null) return STOP;
    }
    return NORMAL;
  }

  const main = lines.map((_, i) => i).filter((i) => lines[i].indent === 0);
  const out = await execBlock(main, { env: new Map(), self: null });
  if (out.kind === 'stop' || rc.cancelled) return;
  if (out.kind === 'return') throw new Error(`dynamic-dispatch: 줄 ${out.line + 1} — 메서드 몸 밖의 return`);
  await rc.emit({ type: 'done', silent: true });
}
