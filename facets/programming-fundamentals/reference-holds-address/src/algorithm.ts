/**
 * 참조 타입 — 목록을 넣은 변수의 자리에는 주소만 든다.
 *
 * `initialData.lines` 의 줄 구조를 차례로 해석한다. 걸음은 줄 걸음이다 — 밟은 줄 하나가
 * 한 걸음이고, 걸음 0 은 아무 줄도 밟지 않은 시작이다.
 *
 * 모형 (서브도메인 공통):
 *   - 이름마다 자리 하나. `let` 줄은 오른쪽 식을 셈하기 **전에** 자리를 잡는다.
 *     자리 주소는 100 부터 하나씩 올라간다
 *   - 목록 식 `[…]` 을 셈하면 목록이 자리 밖 따로 놓이고 주소를 받는다 —
 *     1000 · 1100 · 1200 … 자리 안에는 그 주소만 든다
 *   - 대입은 자리 안의 주소를 바꾼다. 앞 목록은 건드리지 않는다
 *
 * 이 조각이 해석하는 문은 `assign` 하나이고, 오른쪽 식은 목록이어야 한다.
 * 다른 문 · 식이 오면 던진다 — 모르는 것을 지어내 그리지 않는다.
 *
 * 이벤트 (모두 silent 아님):
 *   - `init`  { lines: { indent: number; text: string }[]; listCount: number; widest: number }
 *             걸음 0. 프로그램 전체. listCount 는 줄 구조에 든 목록 식의 수, widest 는 그 가운데
 *             가장 긴 목록의 원소 수 (그림이 목록 놓을 곳과 칸 폭을 미리 정한다)
 *   - `place` { line: number; name: string; slot: number; list: number;
 *               items: (number | string)[]; was: number | null; declare: boolean }
 *             한 줄 걸음. 목록 하나가 주소 `list` 에 놓이고, 이름 `name` 의 자리(주소 `slot`)
 *             안이 `list` 가 된다. `was` 는 그 전에 자리 안에 있던 주소 (새 자리면 null)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 식 — 이 조각이 셈하는 것은 수 · 글자 · 목록이다. */
export type Expr =
  | { num: number }
  | { str: string }
  | { list: Expr[] };

/** 문 — 대입 하나. `declare` 가 참이면 `let` 줄이다. */
export type Stmt = { k: 'assign'; to: string; value: Expr; declare?: boolean };

export type ProgramLine = { indent: number; text: string; stmt: Stmt };

export type ReferenceHoldsAddressFacetData = {
  type: 'reference-holds-address';
  stepMs: number;
  lines: ProgramLine[];
};

const SLOT_BASE = 100;
const LIST_BASE = 1000;
const LIST_STRIDE = 100;

/** 목록 원소를 셈한다. 원소는 수 · 글자만 받는다. */
function evalItem(e: Expr): number | string {
  if ('num' in e) return e.num;
  if ('str' in e) return e.str;
  throw new Error('reference-holds-address: 목록 안의 목록은 해석하지 않는다');
}

/** 줄 구조에 든 목록 식의 수와 가장 긴 목록의 원소 수. */
function measureLists(lines: ProgramLine[]): { count: number; widest: number } {
  let count = 0;
  let widest = 0;
  for (const line of lines) {
    const v = line.stmt.value;
    if (!('list' in v)) continue;
    count += 1;
    widest = Math.max(widest, v.list.length);
  }
  return { count, widest };
}

export async function referenceHoldsAddress(
  ctx: FacetContext<ReferenceHoldsAddressFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<ReferenceHoldsAddressFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const measure = measureLists(lines);
  // 걸음 0 — 프로그램 전체가 보인다. 읽을 것이 있으니 첫 줄 앞에 stepMs 를 둔다.
  await ctx.emit({
    type: 'init',
    payload: {
      lines: lines.map((l) => ({ indent: l.indent, text: l.text })),
      listCount: measure.count,
      widest: measure.widest,
    },
  });

  const slots = new Map<string, { addr: number; holds: number | null }>();
  let nextSlot = SLOT_BASE;
  let nextList = LIST_BASE;

  for (let i = 0; i < lines.length; i++) {
    if (!(await pause())) return;
    const { stmt } = lines[i];
    if (stmt.k !== 'assign') throw new Error('reference-holds-address: assign 만 해석한다');

    // `let` 은 오른쪽을 셈하기 전에 자리를 잡는다.
    if (stmt.declare) {
      if (slots.has(stmt.to)) throw new Error(`reference-holds-address: ${stmt.to} 를 두 번 선언했다`);
      slots.set(stmt.to, { addr: nextSlot, holds: null });
      nextSlot += 1;
    }
    const slot = slots.get(stmt.to);
    if (!slot) throw new Error(`reference-holds-address: 선언 없는 이름 ${stmt.to}`);

    const value = stmt.value;
    if (!('list' in value)) throw new Error('reference-holds-address: 오른쪽은 목록 식이어야 한다');
    const items = value.list.map(evalItem);
    const listAddr = nextList;
    nextList += LIST_STRIDE;

    const was = slot.holds;
    slot.holds = listAddr;

    await ctx.emit({
      type: 'place',
      payload: {
        line: i,
        name: stmt.to,
        slot: slot.addr,
        list: listAddr,
        items,
        was,
        declare: stmt.declare === true,
      },
    });
  }
}
