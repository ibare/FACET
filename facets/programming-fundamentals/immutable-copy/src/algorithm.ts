/**
 * immutable-copy — 목록의 한 자리를 고치는 프로그램과, 베껴 새로 만드는 프로그램을 차례로 돌린다.
 *
 * 데이터는 **프로그램 목록**이고, 프로그램은 **줄 목록**이다. 줄마다 화면 글자(`text`)와 그 줄이 하는 일의
 * 구조(`stmt`)를 함께 둔다. 이 함수는 구조를 해석해 목록의 정체 · 값 · 출력을 셈한다. 글자를 파싱하지 않는다.
 *
 * 걸음 — 문 걸음. 걸음 0 은 시작(`init`), 이어서 프로그램마다 맨 위(들여쓰기 0)의 문 하나가 한 걸음이다.
 * 프로그램은 서로 이어지지 않는다 — 이름표(`env`)는 프로그램마다 새로 선다. 목록의 정체 번호만 하나의 차례로 센다.
 *
 * 목록의 정체 — 목록을 만드는 식(`[…]` · `copyWith`)이 셈될 때마다 새 목록 하나가 생기고 번호를 받는다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *   init       { programs: { id: string; lines: { indent: number; text: string }[] }[] }
 *              걸음 0. 프로그램 전체가 보이고 아무 문도 밟지 않았다
 *   create     { prog: number; line: number; list: number; name: string; items: number[] }
 *              `let name = [ … ]` — 새 목록 `list` 가 생기고 이름 `name` 이 그것을 쥔다
 *   overwrite  { prog: number; line: number; list: number; index: number; was: number; value: number; items: number[] }
 *              `name[index] = value` — 목록 `list` 자체의 자리 `index` 를 덮어쓴다. `was` 는 사라진다. 새 목록은 없다
 *   copy       { prog: number; line: number; from: number; list: number; name: string; index: number;
 *                was: number; value: number; items: number[] }
 *              `let name = copyWith(src, index, value)` — 목록 `from` 을 베낀 새 목록 `list` 의 자리 `index` 에만 `value`.
 *              `from` 은 그대로다 (`was` 는 `from` 의 그 자리에 남는다)
 *   show       { prog: number; line: number; list: number; items: number[] }
 *              `show name` — 이름이 쥔 목록 `list` 의 지금 값을 내보낸다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 식 — 이 조각의 데이터가 쓰는 것만 */
export type ImmutableCopyExpr =
  | { num: number }
  | { var: string }
  | { list: ImmutableCopyExpr[] }
  | { call: string; args: ImmutableCopyExpr[] };

/** 문 — 이 조각의 데이터가 쓰는 것만 */
export type ImmutableCopyStmt =
  | { k: 'assign'; to: string; value: ImmutableCopyExpr; declare?: boolean }
  | { k: 'assignAt'; to: string; index: ImmutableCopyExpr; value: ImmutableCopyExpr }
  | { k: 'show'; value: ImmutableCopyExpr };

export type ImmutableCopyLine = { indent: number; text: string; stmt: ImmutableCopyStmt };

export type ImmutableCopyProgram = { id: string; lines: ImmutableCopyLine[] };

export type ImmutableCopyFacetData = {
  type: 'immutable-copy';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  programs: ImmutableCopyProgram[];
};

type Value = { kind: 'num'; n: number } | { kind: 'list'; id: number };

/** 식을 셈한 결과 — 값과, 셈하는 동안 목록이 생겼다면 그 사연 */
type Made =
  | { kind: 'literal'; list: number }
  | { kind: 'copy'; from: number; list: number; index: number; was: number; value: number };

type Evaluated = { value: Value; made: Made | null };

export async function immutableCopy(ctx0: FacetContext<ImmutableCopyFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<ImmutableCopyFacetData>;
  const { stepMs, programs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  /** 목록의 정체 → 지금 값. 프로그램이 달라도 번호는 한 차례로 센다 */
  const lists = new Map<number, number[]>();
  let nextId = 1;

  function newList(items: number[]): number {
    const id = nextId;
    nextId += 1;
    lists.set(id, items);
    return id;
  }

  function itemsOf(id: number): number[] {
    const items = lists.get(id);
    if (!items) throw new Error(`immutable-copy: 목록 ${id} 이 없다`);
    return [...items];
  }

  function num(v: Value): number {
    if (v.kind !== 'num') throw new Error('immutable-copy: 수가 올 자리에 목록이 왔다');
    return v.n;
  }

  function listId(v: Value): number {
    if (v.kind !== 'list') throw new Error('immutable-copy: 목록이 올 자리에 수가 왔다');
    return v.id;
  }

  function evaluate(e: ImmutableCopyExpr, env: Map<string, Value>): Evaluated {
    if ('num' in e) return { value: { kind: 'num', n: e.num }, made: null };
    if ('var' in e) {
      const v = env.get(e.var);
      if (!v) throw new Error(`immutable-copy: 이름 ${e.var} 이 선언되지 않았다`);
      return { value: v, made: null };
    }
    if ('list' in e) {
      const items = e.list.map((x) => num(evaluate(x, env).value));
      const id = newList(items);
      return { value: { kind: 'list', id }, made: { kind: 'literal', list: id } };
    }
    if (e.call === 'copyWith') {
      const [srcE, iE, vE] = e.args;
      if (!srcE || !iE || !vE) throw new Error('immutable-copy: copyWith 는 인자 셋을 받는다');
      const from = listId(evaluate(srcE, env).value);
      const index = num(evaluate(iE, env).value);
      const value = num(evaluate(vE, env).value);
      const items = itemsOf(from);
      if (index < 0 || index >= items.length) throw new Error('immutable-copy: copyWith 자리가 목록 밖이다');
      const was = items[index] as number;
      items[index] = value;
      const id = newList(items);
      return { value: { kind: 'list', id }, made: { kind: 'copy', from, list: id, index, was, value } };
    }
    throw new Error(`immutable-copy: 모르는 내장 ${e.call}`);
  }

  await ctx.emit({
    type: 'init',
    payload: {
      programs: programs.map((p) => ({
        id: p.id,
        lines: p.lines.map((l) => ({ indent: l.indent, text: l.text })),
      })),
    },
  });

  for (const [prog, program] of programs.entries()) {
    if (ctx.cancelled) return;
    const env = new Map<string, Value>();
    for (const [line, row] of program.lines.entries()) {
      if (ctx.cancelled) return;
      if (row.indent !== 0) continue;
      if (!(await pause())) return;
      const stmt = row.stmt;

      if (stmt.k === 'assign') {
        if (stmt.declare && env.has(stmt.to)) throw new Error(`immutable-copy: ${stmt.to} 을 두 번 선언했다`);
        if (!stmt.declare && !env.has(stmt.to)) throw new Error(`immutable-copy: ${stmt.to} 이 선언되지 않았다`);
        const { value, made } = evaluate(stmt.value, env);
        env.set(stmt.to, value);
        if (made?.kind === 'literal') {
          await ctx.emit({
            type: 'create',
            payload: { prog, line, list: made.list, name: stmt.to, items: itemsOf(made.list) },
          });
        } else if (made?.kind === 'copy') {
          await ctx.emit({
            type: 'copy',
            payload: {
              prog,
              line,
              from: made.from,
              list: made.list,
              name: stmt.to,
              index: made.index,
              was: made.was,
              value: made.value,
              items: itemsOf(made.list),
            },
          });
        } else {
          throw new Error('immutable-copy: 목록을 만들지 않는 넣기는 이 조각에 없다');
        }
      } else if (stmt.k === 'assignAt') {
        const target = env.get(stmt.to);
        if (!target) throw new Error(`immutable-copy: 이름 ${stmt.to} 이 선언되지 않았다`);
        const id = listId(target);
        const index = num(evaluate(stmt.index, env).value);
        const value = num(evaluate(stmt.value, env).value);
        const items = lists.get(id);
        if (!items || index < 0 || index >= items.length) throw new Error('immutable-copy: 넣을 자리가 목록 밖이다');
        const was = items[index] as number;
        items[index] = value;
        await ctx.emit({
          type: 'overwrite',
          payload: { prog, line, list: id, index, was, value, items: itemsOf(id) },
        });
      } else {
        const id = listId(evaluate(stmt.value, env).value);
        await ctx.emit({ type: 'show', payload: { prog, line, list: id, items: itemsOf(id) } });
      }
    }
  }
}
