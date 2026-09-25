/**
 * aliasing — 이름 둘이 목록 하나를 함께 쥐면, 한 이름으로 고친 것이 다른 이름으로 읽힌다.
 *
 * `initialData.lines` 의 줄 구조를 위에서부터 해석한다. 글자는 파싱하지 않는다.
 * 모형 (변수 · 타입 서브도메인 공통):
 *   - `let` 줄은 오른쪽 식을 셈하기 전에 자리를 잡는다. 자리 주소는 100 부터 하나씩
 *   - 수 · 글자는 자리 안에 값 자체가 든다
 *   - 목록 식 `[…]` 은 자리 밖에 목록을 놓고 주소(1000 · 1100 …)를 받는다. 자리에는 그 주소만 든다
 *   - 대입은 자리 안의 것을 베껴 쓴다 — 목록 주소면 주소만 베낀다 (목록은 베끼지 않는다)
 *
 * 이벤트 (모두 걸음이다. silent 없음):
 *   start   { lines: { indent: number; text: string }[] }
 *           걸음 0. 프로그램 전체가 보이고 아무 줄도 밟지 않았다
 *   assign  { line: number; name: string; addr: number; value: Val; declare: boolean;
 *             made: { ref: number; items: Val[] } | null; source: string | null }
 *           `let name = …` / `name = …` 한 줄. made = 이 줄에서 새로 놓인 목록,
 *           source = 오른쪽이 이름 하나(`let b = a`)였을 때 그 이름
 *   setItem { line: number; via: string; ref: number; at: number; old: Val; value: Val }
 *           `via[at] = value` — via 자리의 주소 ref 가 가리키는 목록의 at 번 칸을 고친다
 *   show    { line: number; value: Val; read: { via: string; ref: number; at: number } | null }
 *           `show 식` — 출력 한 줄. read = 식이 목록 읽기 `via[at]` 였을 때 어디서 읽었는가
 *
 *   Val = { num: number } | { str: string } | { ref: number }
 *
 * 걸음 규약은 줄 걸음이다 — 걸음 0 은 시작, 밟은 줄 하나가 한 걸음.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: string; l: Expr; r: Expr }
  | { list: Expr[] }
  | { item: string; at: Expr };

export type Stmt =
  | { k: 'assign'; to: string; value: Expr; declare?: boolean }
  | { k: 'setItem'; list: string; at: Expr; value: Expr }
  | { k: 'show'; value: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type Val = { num: number } | { str: string } | { ref: number };

export type AliasingFacetData = {
  type: 'aliasing';
  stepMs: number;
  lines: CodeLine[];
};

const SLOT_BASE = 100;
const LIST_BASE = 1000;
const LIST_GAP = 100;

export async function aliasing(context: FacetContext<AliasingFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<AliasingFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const slots = new Map<string, { addr: number; val: Val }>();
  const lists = new Map<number, Val[]>();
  let nextSlot = SLOT_BASE;
  let made: { ref: number; items: Val[] } | null = null;
  let read: { via: string; ref: number; at: number } | null = null;

  function slotOf(name: string): { addr: number; val: Val } {
    const s = slots.get(name);
    if (!s) throw new Error(`aliasing: 이름 ${name} 의 자리가 없다`);
    return s;
  }
  function listOf(v: Val): { ref: number; items: Val[] } {
    if (!('ref' in v)) throw new Error('aliasing: 목록 주소가 아닌 것을 따라갔다');
    const items = lists.get(v.ref);
    if (!items) throw new Error(`aliasing: 주소 ${v.ref} 에 목록이 없다`);
    return { ref: v.ref, items };
  }
  function numOf(v: Val): number {
    if (!('num' in v)) throw new Error('aliasing: 수가 아닌 값');
    return v.num;
  }

  function evaluate(e: Expr): Val {
    if ('num' in e) return { num: e.num };
    if ('str' in e) return { str: e.str };
    if ('var' in e) return { ...slotOf(e.var).val };
    if ('list' in e) {
      const items = e.list.map(evaluate);
      const ref = LIST_BASE + lists.size * LIST_GAP;
      lists.set(ref, items);
      made = { ref, items: items.map((v) => ({ ...v })) };
      return { ref };
    }
    if ('item' in e) {
      const { ref, items } = listOf(slotOf(e.item).val);
      const at = numOf(evaluate(e.at));
      const v = items[at];
      if (!v) throw new Error(`aliasing: ${e.item}[${at}] 는 목록 밖이다`);
      read = { via: e.item, ref, at };
      return { ...v };
    }
    const l = numOf(evaluate(e.l));
    const r = numOf(evaluate(e.r));
    switch (e.op) {
      case '+': return { num: l + r };
      case '-': return { num: l - r };
      case '*': return { num: l * r };
      default: throw new Error(`aliasing: 이 조각이 셈하지 않는 연산 ${e.op}`);
    }
  }

  await ctx.emit({
    type: 'start',
    payload: { lines: lines.map((ln) => ({ indent: ln.indent, text: ln.text })) },
  });

  for (let i = 0; i < lines.length; i += 1) {
    if (!(await pause())) return;
    const stmt = lines[i]!.stmt;
    made = null;
    read = null;

    if (stmt.k === 'assign') {
      if (stmt.declare) {
        slots.set(stmt.to, { addr: nextSlot, val: { num: 0 } });
        nextSlot += 1;
      }
      const slot = slotOf(stmt.to);
      const value = evaluate(stmt.value);
      slot.val = value;
      const source = 'var' in stmt.value ? stmt.value.var : null;
      await ctx.emit({
        type: 'assign',
        payload: {
          line: i, name: stmt.to, addr: slot.addr, value, declare: stmt.declare === true,
          made, source,
        },
      });
    } else if (stmt.k === 'setItem') {
      const { ref, items } = listOf(slotOf(stmt.list).val);
      const at = numOf(evaluate(stmt.at));
      const old = items[at];
      if (!old) throw new Error(`aliasing: ${stmt.list}[${at}] 는 목록 밖이다`);
      const value = evaluate(stmt.value);
      items[at] = value;
      await ctx.emit({
        type: 'setItem',
        payload: { line: i, via: stmt.list, ref, at, old, value },
      });
    } else {
      const value = evaluate(stmt.value);
      await ctx.emit({ type: 'show', payload: { line: i, value, read } });
    }
  }
}
