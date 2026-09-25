/**
 * 섀도잉 — 몸 안의 `let` 이 바깥과 같은 이름의 새 자리를 앞에 세워 가린다.
 *
 * `initialData.lines` 의 줄 구조를 한 줄씩 해석한다. 이름 찾기는 안쪽 몸부터
 * 바깥으로 가며 처음 찾은 자리에서 멈춘다. `let` 은 오른쪽 식을 셈하기 전에
 * 자리를 잡는다. 몸을 벗어나면 그 몸이 잡은 자리가 걷히고, 걷힌 주소는 다음에
 * 잡는 자리가 다시 쓴다. 몸을 벗어나는 것은 걸음이 아니다 — 걷힘은 다음 걸음의
 * payload(`gone`)에 실린다.
 *
 * 이벤트 (모두 걸음이다. silent 없음):
 *   init     { lines: { indent: number; text: string }[]; names: string[] }
 *              걸음 0. 프로그램 전체. `names` 는 `let` 이 선언하는 이름(처음 나온 차례)
 *   declare  { line; name; addr; depth; value; reads; gone }
 *              `let name = …` — 자리 addr 을 새로 잡고 value 를 넣었다
 *   write    { line; name; addr; depth; before; value; reads; gone }
 *              `name = …` — 찾은 자리 addr 의 값이 before 에서 value 로 바뀌었다
 *   test     { line; value: boolean; opens: boolean; reads; gone }
 *              `if …` — 조건을 셈했다. opens 가 참이면 몸으로 들어간다
 *   show     { line; value; reads; gone }
 *              `show …` — value 를 출력했다
 *
 *   line  = 밟은 줄의 번호 (0 부터)
 *   value · before = number | string | boolean
 *   reads = { name: string; addr: number; value }[]  — 식을 셈하며 찾아 읽은 자리
 *   gone  = { header: number; slots: { addr; name; value; depth }[] }[]
 *           — 이 걸음 앞에서 벗어난 몸(머리줄 번호)과 그 몸이 잡았다 걷힌 자리
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Op = '+' | '-' | '*' | '>' | '<' | '>=' | '<=' | '==' | '!=';

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: Op; l: Expr; r: Expr };

export type Stmt =
  | { k: 'assign'; to: string; value: Expr; declare?: boolean }
  | { k: 'if'; cond: Expr }
  | { k: 'show'; value: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export interface ShadowingFacetData {
  type: 'shadowing';
  stepMs: number;
  lines: CodeLine[];
}

export type Value = number | string | boolean;

/** 자리 주소가 시작하는 수 (서브도메인 모형). */
export const BASE_ADDR = 100;

type Slot = { addr: number; name: string; value: Value | null; depth: number };
type Read = { name: string; addr: number; value: Value };
type Scope = { header: number; indent: number; names: Map<string, number> };
type Gone = { header: number; slots: Slot[] };

function apply(op: Op, l: Value, r: Value): Value {
  if (op === '==') return l === r;
  if (op === '!=') return l !== r;
  if (op === '+' && (typeof l === 'string' || typeof r === 'string')) return String(l) + String(r);
  if (typeof l !== 'number' || typeof r !== 'number') throw new Error(`shadowing: ${op} 는 수끼리만`);
  switch (op) {
    case '+':
      return l + r;
    case '-':
      return l - r;
    case '*':
      return l * r;
    case '>':
      return l > r;
    case '<':
      return l < r;
    case '>=':
      return l >= r;
    case '<=':
      return l <= r;
  }
}

export async function shadowing(context: FacetContext<ShadowingFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ShadowingFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const slots = new Map<number, Slot>();
  const scopes: Scope[] = [{ header: -1, indent: 0, names: new Map() }];
  let nextAddr = BASE_ADDR;

  function lookup(name: string): number {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      const addr = scopes[i].names.get(name);
      if (addr !== undefined) return addr;
    }
    throw new Error(`shadowing: 이름 ${name} 을 찾지 못했다`);
  }

  function evaluate(e: Expr, reads: Read[]): Value {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) {
      const addr = lookup(e.var);
      const value = slots.get(addr)?.value ?? null;
      if (value === null) throw new Error(`shadowing: ${e.var} 는 값이 들기 전이다`);
      reads.push({ name: e.var, addr, value });
      return value;
    }
    const l = evaluate(e.l, reads);
    const r = evaluate(e.r, reads);
    return apply(e.op, l, r);
  }

  const names: string[] = [];
  for (const line of lines) {
    if (ctx.cancelled) return;
    if (line.stmt.k === 'assign' && line.stmt.declare && !names.includes(line.stmt.to)) names.push(line.stmt.to);
  }

  // 걸음 0 — 프로그램 전체가 보이고 아무 줄도 밟지 않았다.
  await ctx.emit({
    type: 'init',
    payload: { lines: lines.map((l) => ({ indent: l.indent, text: l.text })), names },
  });

  let pc = 0;
  while (pc < lines.length) {
    // 걸음 0 이 이미 읽을 것이 있는 화면이라 첫 줄 앞에도 stepMs 를 둔다.
    if (!(await pause())) return;
    const line = lines[pc];

    // 몸을 벗어났으면 그 몸이 잡은 자리를 걷는다 — 이 걸음이 가진다.
    const gone: Gone[] = [];
    while (scopes.length > 1 && line.indent < scopes[scopes.length - 1].indent) {
      const scope = scopes.pop();
      if (!scope) break;
      const freed: Slot[] = [];
      for (const addr of scope.names.values()) {
        const slot = slots.get(addr);
        if (slot) freed.push({ ...slot });
        slots.delete(addr);
      }
      nextAddr -= freed.length;
      gone.push({ header: scope.header, slots: freed });
    }

    const stmt = line.stmt;
    const depth = scopes.length - 1;
    const reads: Read[] = [];

    if (stmt.k === 'assign' && stmt.declare) {
      // 자리를 먼저 잡고 오른쪽 식을 셈한다.
      const addr = nextAddr;
      nextAddr += 1;
      scopes[depth].names.set(stmt.to, addr);
      slots.set(addr, { addr, name: stmt.to, value: null, depth });
      const value = evaluate(stmt.value, reads);
      slots.set(addr, { addr, name: stmt.to, value, depth });
      await ctx.emit({ type: 'declare', payload: { line: pc, name: stmt.to, addr, depth, value, reads, gone } });
      pc += 1;
    } else if (stmt.k === 'assign') {
      const value = evaluate(stmt.value, reads);
      const addr = lookup(stmt.to);
      const slot = slots.get(addr);
      if (!slot || slot.value === null) throw new Error(`shadowing: ${stmt.to} 의 자리가 비었다`);
      const before = slot.value;
      slots.set(addr, { ...slot, value });
      await ctx.emit({
        type: 'write',
        payload: { line: pc, name: stmt.to, addr, depth: slot.depth, before, value, reads, gone },
      });
      pc += 1;
    } else if (stmt.k === 'if') {
      const value = evaluate(stmt.cond, reads);
      const opens = value === true;
      await ctx.emit({ type: 'test', payload: { line: pc, value, opens, reads, gone } });
      if (opens) {
        scopes.push({ header: pc, indent: line.indent + 1, names: new Map() });
        pc += 1;
      } else {
        // 몸을 건너뛴다.
        let next = pc + 1;
        while (next < lines.length && lines[next].indent > line.indent) {
          if (ctx.cancelled) return;
          next += 1;
        }
        pc = next;
      }
    } else {
      const value = evaluate(stmt.value, reads);
      await ctx.emit({ type: 'show', payload: { line: pc, value, reads, gone } });
      pc += 1;
    }
  }
}
