/**
 * value-in-place — 수를 다른 이름에 넣으면 무엇이 옮겨 가는가.
 *
 * `initialData.lines` 의 줄 구조를 위에서부터 한 줄씩 해석한다. 이름마다 자리 하나,
 * `let` 줄이 자리를 새로 잡고(주소 100 부터 하나씩), `let` 없는 대입은 이미 있는 자리에 쓴다.
 * 수 · 글자는 값 종류라 자리 안에 값 자체가 들고, 대입과 읽기는 값을 **베낀다.**
 *
 * 이벤트 (둘 다 걸음 경계, silent 아님):
 *   init  payload { lines: { indent: number; text: string }[]; slotCount: number }
 *         걸음 0. 프로그램 전체. slotCount 는 `let` 줄 수 — 자리를 놓을 칸 수다
 *   step  payload {
 *           line: number;               // 밟은 줄 (0 부터)
 *           kind: 'assign' | 'show';
 *           name?: string;              // assign 의 대상 이름
 *           declare: boolean;           // let 줄이면 참 — 자리를 새로 잡았다
 *           addr?: number;              // assign 이 쓴 자리의 주소
 *           value: number | string;     // 쓴 값 · 보인 값
 *           was?: number | string;      // let 없는 assign 에서 그 자리에 있던 값
 *           from: 'literal' | 'slot' | 'calc';  // 값이 어디서 왔나
 *           src?: string;               // from 이 slot 일 때 읽은 이름
 *           last: boolean;              // 프로그램의 마지막 걸음인가
 *         }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: '+' | '-' | '*'; l: Expr; r: Expr };

export type Stmt =
  | { k: 'assign'; to: string; value: Expr; declare?: true }
  | { k: 'show'; value: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type ValueInPlaceFacetData = {
  type: 'value-in-place';
  stepMs: number;
  lines: CodeLine[];
};

type Value = number | string;
/** value 가 없으면 자리는 잡혔지만 아직 아무것도 넣지 않은 것이다. */
type Slot = { addr: number; value?: Value };

const FIRST_ADDR = 100;

function evaluate(e: Expr, slots: Map<string, Slot>): Value {
  if ('num' in e) return e.num;
  if ('str' in e) return e.str;
  if ('var' in e) {
    const slot = slots.get(e.var);
    if (!slot) throw new Error(`value-in-place: 자리가 없는 이름 ${e.var}`);
    if (slot.value === undefined) throw new Error(`value-in-place: 값을 넣기 전에 읽은 이름 ${e.var}`);
    return slot.value;
  }
  const l = evaluate(e.l, slots);
  const r = evaluate(e.r, slots);
  if (e.op === '+') {
    if (typeof l === 'number' && typeof r === 'number') return l + r;
    return String(l) + String(r);
  }
  if (typeof l !== 'number' || typeof r !== 'number') {
    throw new Error(`value-in-place: 수가 아닌 값에 ${e.op}`);
  }
  return e.op === '-' ? l - r : l * r;
}

function origin(e: Expr): { from: 'literal' | 'slot' | 'calc'; src?: string } {
  if ('var' in e) return { from: 'slot', src: e.var };
  if ('op' in e) return { from: 'calc' };
  return { from: 'literal' };
}

export async function valueInPlace(context: FacetContext<ValueInPlaceFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ValueInPlaceFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let slotCount = 0;
  for (const line of lines) {
    if (ctx.cancelled) return;
    if (line.stmt.k === 'assign' && line.stmt.declare) slotCount += 1;
  }

  await ctx.emit({
    type: 'init',
    payload: { lines: lines.map((l) => ({ indent: l.indent, text: l.text })), slotCount },
  });

  const slots = new Map<string, Slot>();
  let nextAddr = FIRST_ADDR;

  for (let i = 0; i < lines.length; i += 1) {
    if (!(await pause())) return;
    const stmt = lines[i]!.stmt;
    const last = i === lines.length - 1;

    if (stmt.k === 'assign') {
      if (stmt.declare) {
        // let 줄은 오른쪽 식을 셈하기 전에 자리를 잡는다
        const addr = nextAddr;
        nextAddr += 1;
        slots.set(stmt.to, { addr });
        const value = evaluate(stmt.value, slots);
        slots.set(stmt.to, { addr, value });
        await ctx.emit({
          type: 'step',
          payload: { line: i, kind: 'assign', name: stmt.to, declare: true, addr, value, ...origin(stmt.value), last },
        });
      } else {
        const slot = slots.get(stmt.to);
        if (!slot) throw new Error(`value-in-place: 자리가 없는 이름 ${stmt.to}`);
        const addr = slot.addr;
        const was = slot.value;
        const value = evaluate(stmt.value, slots);
        slots.set(stmt.to, { addr, value });
        await ctx.emit({
          type: 'step',
          payload: { line: i, kind: 'assign', name: stmt.to, declare: false, addr, value, was, ...origin(stmt.value), last },
        });
      }
    } else {
      const value = evaluate(stmt.value, slots);
      await ctx.emit({
        type: 'step',
        payload: { line: i, kind: 'show', declare: false, value, ...origin(stmt.value), last },
      });
    }
  }
}
