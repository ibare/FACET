/**
 * reference-cycle — 서로 가리키는 두 객체의 가리키는 수.
 *
 * 줄 목록(구조)을 위에서부터 밟으며 가리키는 수를 센다. 이름 칸이나 필드가 객체를
 * 가리키게 되면 그 객체의 수가 오르고, 가리키던 것을 놓으면 내린다 — 새 값을 먼저
 * 올리고 옛 값을 내린다. 줄 걸음이 끝났을 때 수가 0 인 객체를 치우고, 치운 객체의
 * 필드가 가리키던 것의 수를 내린다 (치움 걸음). 객체 이름은 만든 차례로 A, B, …
 *
 * 수는 따로 두지 않는다 — 객체마다 **누가 가리키는가**(가리킴 목록)를 쥐고, 그 길이가
 * 곧 수다. 장면과 그림은 이 목록만 이어 받는다.
 *
 * 이벤트
 *   init     (silent)  { lines: { indent, text }[], names: string[] }
 *                      바깥 틀이 시작에서 잡는 이름 칸 (선언 차례). 칸은 비어 있다
 *   line               { line: number, changes: Change[] }   줄 하나를 밟은 걸음
 *   reclaim            { obj: string, changes: Change[] }    수가 0 인 객체를 치운 걸음
 *
 *   Change =
 *     { op: 'create',  obj, type, fields: string[] }         새 객체. 필드는 모두 null
 *     { op: 'cell',    name, value: Val }                    이름 칸에 넣음
 *     { op: 'field',   obj, field, value: Val }              객체 필드에 넣음
 *     { op: 'hold',    obj, by: Holder }                     obj 의 수 +1
 *     { op: 'release', obj, by: Holder, at }                 obj 의 수 −1. at = 가리킴 목록에서 빠진 자리
 *     { op: 'gone',    obj }                                 치움
 *   Val    = { k: 'null' } | { k: 'num', n } | { k: 'ref', obj }
 *   Holder = { kind: 'name', name } | { kind: 'field', obj, field }
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RcExpr =
  | { num: number }
  | { null: true }
  | { var: string }
  | { new: string };

export type RcStmt =
  | { k: 'assign'; to: string; declare?: boolean; value: RcExpr }
  | { k: 'setField'; obj: string; field: string; value: RcExpr };

export type RcLine = { indent: number; text: string; stmt: RcStmt };

export type RcType = { name: string; fields: string[] };

export type ReferenceCycleFacetData = {
  type: 'reference-cycle';
  stepMs: number;
  /** 객체의 모양. 필드의 처음 값은 null */
  types: RcType[];
  lines: RcLine[];
};

export type RcVal = { k: 'null' } | { k: 'num'; n: number } | { k: 'ref'; obj: string };
export type RcHolder = { kind: 'name'; name: string } | { kind: 'field'; obj: string; field: string };
export type RcChange =
  | { op: 'create'; obj: string; type: string; fields: string[] }
  | { op: 'cell'; name: string; value: RcVal }
  | { op: 'field'; obj: string; field: string; value: RcVal }
  | { op: 'hold'; obj: string; by: RcHolder }
  | { op: 'release'; obj: string; by: RcHolder; at: number }
  | { op: 'gone'; obj: string };

type Obj = { fields: Map<string, RcVal>; holders: RcHolder[]; gone: boolean };

export function sameHolder(a: RcHolder, b: RcHolder): boolean {
  if (a.kind === 'name' && b.kind === 'name') return a.name === b.name;
  if (a.kind === 'field' && b.kind === 'field') return a.obj === b.obj && a.field === b.field;
  return false;
}

/** 바깥 틀이 시작에서 잡는 이름들 — 맨 바깥의 `let` 을 글자 차례로. */
export function topLevelNames(lines: readonly RcLine[]): string[] {
  const names: string[] = [];
  for (const ln of lines) {
    if (ln.indent === 0 && ln.stmt.k === 'assign' && ln.stmt.declare === true) names.push(ln.stmt.to);
  }
  return names;
}

export async function referenceCycle(context: FacetContext<ReferenceCycleFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ReferenceCycleFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const names = topLevelNames(data.lines);
  const cells = new Map<string, RcVal | null>(names.map((n) => [n, null]));
  const objs = new Map<string, Obj>();
  const order: string[] = [];

  /** 줄 번호(1 부터)를 붙여 던진다. 치움 걸음처럼 줄이 없으면 ln 은 null. */
  function fail(ln: number | null, msg: string): never {
    throw new Error(ln === null ? `reference-cycle: ${msg}` : `reference-cycle: 줄 ${ln + 1} — ${msg}`);
  }

  function hold(v: RcVal, by: RcHolder, out: RcChange[], ln: number | null): void {
    if (v.k !== 'ref') return;
    const o = objs.get(v.obj);
    if (!o) fail(ln, `없는 객체 ${v.obj} 를 가리키려 한다`);
    o.holders.push(by);
    out.push({ op: 'hold', obj: v.obj, by });
  }

  function release(v: RcVal | null | undefined, by: RcHolder, out: RcChange[], ln: number | null): void {
    if (!v || v.k !== 'ref') return;
    const o = objs.get(v.obj);
    if (!o) fail(ln, `없는 객체 ${v.obj} 의 가리킴을 놓으려 한다`);
    const at = o.holders.findIndex((h) => sameHolder(h, by));
    if (at < 0) fail(ln, `객체 ${v.obj} 의 가리킴 목록에 없는 것을 놓으려 한다`);
    o.holders.splice(at, 1);
    out.push({ op: 'release', obj: v.obj, by, at });
  }

  function evaluate(e: RcExpr, out: RcChange[], ln: number): RcVal {
    if ('num' in e) return { k: 'num', n: e.num };
    if ('null' in e) return { k: 'null' };
    if ('var' in e) {
      const v = cells.get(e.var);
      if (!v) fail(ln, `값이 없는 이름 ${e.var}`);
      return v;
    }
    if ('new' in e) {
      const type = data.types.find((t) => t.name === e.new);
      if (!type) fail(ln, `모르는 모양 ${e.new}`);
      const id = String.fromCharCode(65 + order.length);
      order.push(id);
      objs.set(id, { fields: new Map(type.fields.map((f) => [f, { k: 'null' } as RcVal])), holders: [], gone: false });
      out.push({ op: 'create', obj: id, type: type.name, fields: [...type.fields] });
      return { k: 'ref', obj: id };
    }
    return fail(ln, `모르는 식 ${JSON.stringify(e)}`);
  }

  function exec(stmt: RcStmt, ln: number): RcChange[] {
    const out: RcChange[] = [];
    if (stmt.k === 'assign') {
      if (!cells.has(stmt.to)) fail(ln, `칸이 없는 이름 ${stmt.to}`);
      const v = evaluate(stmt.value, out, ln);
      const by: RcHolder = { kind: 'name', name: stmt.to };
      const old = cells.get(stmt.to);
      hold(v, by, out, ln);
      release(old, by, out, ln);
      cells.set(stmt.to, v);
      out.push({ op: 'cell', name: stmt.to, value: v });
      return out;
    }
    if (stmt.k === 'setField') {
      const target = cells.get(stmt.obj);
      if (!target || target.k !== 'ref') fail(ln, `객체가 아닌 이름 ${stmt.obj}`);
      const o = objs.get(target.obj);
      if (!o) fail(ln, `없는 객체 ${target.obj}`);
      if (!o.fields.has(stmt.field)) fail(ln, `없는 필드 ${stmt.field}`);
      const v = evaluate(stmt.value, out, ln);
      const by: RcHolder = { kind: 'field', obj: target.obj, field: stmt.field };
      hold(v, by, out, ln);
      release(o.fields.get(stmt.field), by, out, ln);
      o.fields.set(stmt.field, v);
      out.push({ op: 'field', obj: target.obj, field: stmt.field, value: v });
      return out;
    }
    return fail(ln, `모르는 문 ${JSON.stringify(stmt)}`);
  }

  /** 수가 0 이고 아직 치우지 않은 첫 객체. */
  function nextZero(): string | null {
    for (const id of order) {
      const o = objs.get(id);
      if (o && !o.gone && o.holders.length === 0) return id;
    }
    return null;
  }

  // 걸음 0 — 프로그램 전체와 비어 있는 이름 칸
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { lines: data.lines.map((l) => ({ indent: l.indent, text: l.text })), names },
  });

  for (let i = 0; i < data.lines.length; i += 1) {
    if (!(await pause())) return;
    const changes = exec(data.lines[i].stmt, i);
    await ctx.emit({ type: 'line', payload: { line: i, changes } });

    let zero = nextZero();
    while (zero !== null) {
      if (!(await pause())) return;
      const o = objs.get(zero);
      if (!o) fail(null, `치울 객체 ${zero} 가 없다`);
      o.gone = true;
      const out: RcChange[] = [{ op: 'gone', obj: zero }];
      for (const [field, v] of o.fields) release(v, { kind: 'field', obj: zero, field }, out, null);
      await ctx.emit({ type: 'reclaim', payload: { obj: zero, changes: out } });
      zero = nextZero();
    }
  }
}
