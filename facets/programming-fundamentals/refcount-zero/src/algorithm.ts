/**
 * 참조 계수 — 세던 수가 0 이 되면 그 줄 뒤에 곧바로 치운다.
 *
 * 줄 구조(`lines`)를 차례로 해석한다. 이름 칸이 객체를 가리키게 되면 그 객체의 수가 +1,
 * 가리키던 것을 놓으면 −1 (새 값을 먼저 올리고 옛 값을 내린다). 줄 걸음이 끝났을 때 수가 0 인
 * 객체가 있으면 객체 하나마다 치움 한 걸음을 둔다. 객체 이름은 만든 차례로 A, B, …
 * 스택 칸은 맨 바깥의 `let` 이름을 글자 차례로 500 부터 잡는다 (예로 정한 주소).
 *
 * 걸음 0 의 바탕(줄 · 칸)은 장면의 `initial` 이 initialData 에서 같은 `outerSlots` 로 세운다 — 시작 발신은 없다.
 *
 * 이벤트 (모두 silent 아님)
 * - `line` — 줄 하나를 밟았다.
 *     payload `{ line: number; name: string; value: Val; created: string | null; objects: Obj[] }`
 *     `line` 은 0 부터의 줄 차례, `name` 은 값을 받은 이름, `objects` 는 그 줄 뒤 살아 있는 객체 전부
 * - `sweep` — 수가 0 인 객체 하나를 치웠다.
 *     payload `{ obj: string; objects: Obj[] }` — `objects` 는 치운 뒤 살아 있는 객체 전부
 *
 * `Val` = `{ k: 'null' } | { k: 'num'; n: number } | { k: 'ref'; obj: string }`
 * `Obj` = `{ name: string; count: number; holders: string[] }` — `holders` 는 가리키는 이름을 잡은 차례로
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr = { num: number } | { null: true } | { var: string } | { new: string };

export type Stmt = { k: 'assign'; to: string; value: Expr; declare?: boolean };

export type Line = { indent: number; text: string; stmt: Stmt };

export type RefcountZeroFacetData = {
  type: 'refcount-zero';
  stepMs: number;
  lines: Line[];
};

export type Val = { k: 'null' } | { k: 'num'; n: number } | { k: 'ref'; obj: string };

export type Obj = { name: string; count: number; holders: string[] };

/** 스택 칸 주소의 시작 — 예로 정한 값. */
const STACK_BASE = 500;

/** 맨 바깥 틀이 시작에서 잡는 칸 — `let` 이름을 글자 차례로. */
export function outerSlots(lines: readonly Line[]): { name: string; addr: number }[] {
  const names: string[] = [];
  for (const ln of lines) {
    if (ln.indent === 0 && ln.stmt.declare === true && !names.includes(ln.stmt.to)) {
      names.push(ln.stmt.to);
    }
  }
  return names.map((name, i) => ({ name, addr: STACK_BASE + i }));
}

function objectName(i: number): string {
  return String.fromCharCode(65 + i);
}

export async function refcountZero(ctx0: FacetContext<RefcountZeroFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<RefcountZeroFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const vals = new Map<string, Val>();
  const alive: Obj[] = [];
  let made = 0;

  const snapshot = (): Obj[] =>
    alive.map((o) => ({ name: o.name, count: o.count, holders: [...o.holders] }));
  const find = (name: string): Obj => {
    const o = alive.find((x) => x.name === name);
    if (!o) throw new Error(`refcount-zero: 살아 있지 않은 객체 ${name}`);
    return o;
  };

  for (let i = 0; i < lines.length; i += 1) {
    // 걸음 0 은 프로그램 전체가 읽히는 화면이라 첫 줄 앞에도 머문다.
    if (!(await pause())) return;
    const { stmt } = lines[i];
    const e = stmt.value;
    let value: Val;
    let created: string | null = null;
    if ('null' in e) {
      value = { k: 'null' };
    } else if ('num' in e) {
      value = { k: 'num', n: e.num };
    } else if ('var' in e) {
      const v = vals.get(e.var);
      if (!v) throw new Error(`refcount-zero: 값이 없는 이름 ${e.var}`);
      value = v;
    } else {
      created = objectName(made);
      made += 1;
      alive.push({ name: created, count: 0, holders: [] });
      value = { k: 'ref', obj: created };
    }

    const old = vals.get(stmt.to);
    // 새 값을 먼저 올리고 옛 값을 내린다.
    if (value.k === 'ref') {
      const o = find(value.obj);
      o.count += 1;
      o.holders.push(stmt.to);
    }
    if (old && old.k === 'ref') {
      const o = find(old.obj);
      o.count -= 1;
      o.holders.splice(o.holders.indexOf(stmt.to), 1);
    }
    vals.set(stmt.to, value);

    await ctx.emit({
      type: 'line',
      payload: { line: i, name: stmt.to, value, created, objects: snapshot() },
    });

    for (let z = alive.findIndex((o) => o.count === 0); z >= 0; z = alive.findIndex((o) => o.count === 0)) {
      if (!(await pause())) return;
      const [gone] = alive.splice(z, 1);
      await ctx.emit({ type: 'sweep', payload: { obj: gone.name, objects: snapshot() } });
    }
  }
}
