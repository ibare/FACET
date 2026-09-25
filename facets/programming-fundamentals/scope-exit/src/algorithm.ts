/**
 * 스코프 종료 — 몸 안에서 `let` 한 이름은 몸을 벗어나면 몸과 함께 걷힌다.
 *
 * 줄 목록(`lines`)의 구조(`stmt`)를 해석해 한 줄씩 밟는다. 이 조각만 **몸을 벗어나는 것도
 * 한 걸음**으로 센다. 걷힌 이름을 부르면 이름 없음 한 걸음을 내고 프로그램이 멈춘다.
 *
 * 모형 — 이름마다 자리 하나. `let` 줄은 오른쪽 식을 셈하기 전에 자리를 잡는다. 자리 주소는
 * 100 부터 잡는 차례로 하나씩 올라가고, 몸을 벗어나면 그 몸이 잡은 자리를 걷고 다음 자리가 그
 * 주소를 다시 쓴다. 이름 찾기는 안쪽 몸부터 바깥으로.
 *
 * 이벤트 (모두 걸음이다. silent 없음)
 *   init         { lines: { indent: number; text: string }[];
 *                  bodies: { head: number; from: number; to: number }[] }
 *                걸음 0. 프로그램 전체. bodies 는 `if` 머리줄과 그 몸의 줄 범위(0 부터, 양 끝 포함)
 *   assign       { line: number; name: string; addr: number; value: Value; was: Value | null;
 *                  declare: boolean; slot: number; reads: { name: string; slot: number }[] }
 *                `let` 또는 대입 한 줄. slot 은 그 이름의 자리를 잡은 줄(자리의 식별자),
 *                reads 는 오른쪽 식이 읽은 다른 이름의 자리. was 는 선언이면 null
 *   branch       { line: number; l: Value; op: string; r: Value; result: boolean }
 *                `if` 줄. 참이면 그 몸이 열린다
 *   exit         { head: number; gone: { name: string; addr: number; value: Value; slot: number }[] }
 *                줄을 밟지 않는 걸음 — head 의 몸을 벗어나며 몸이 잡은 자리가 걷힌다
 *   show         { line: number; value: Value; from: { name: string; slot: number } | null }
 *                `show` 줄. 출력 한 줄
 *   unknownName  { line: number; name: string }
 *                찾을 이름이 없다. 프로그램이 여기서 멈춘다 (마지막 걸음)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Value = number | string;

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: string; l: Expr; r: Expr };

export type Stmt =
  | { k: 'assign'; to: string; value: Expr; declare?: true }
  | { k: 'if'; cond: { op: string; l: Expr; r: Expr } }
  | { k: 'show'; value: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type ScopeExitFacetData = {
  type: 'scope-exit';
  stepMs: number;
  lines: CodeLine[];
};

type Slot = { name: string; addr: number; value: Value; slot: number };
type Frame = { base: number; slots: Slot[] };

/** 머리줄 `if` 마다 그 몸 — 바로 아래에서 머리보다 깊이 들여쓴 줄들. */
function findBodies(lines: CodeLine[]): { head: number; from: number; to: number }[] {
  const out: { head: number; from: number; to: number }[] = [];
  lines.forEach((ln, i) => {
    if (ln.stmt.k !== 'if') return;
    let to = i;
    while (to + 1 < lines.length && lines[to + 1].indent > ln.indent) to += 1;
    out.push({ head: i, from: i + 1, to });
  });
  return out;
}

function apply(op: string, l: Value, r: Value): Value | boolean {
  if (op === '+') return typeof l === 'number' && typeof r === 'number' ? l + r : String(l) + String(r);
  if (op === '-') return Number(l) - Number(r);
  if (op === '*') return Number(l) * Number(r);
  if (op === '>') return l > r;
  if (op === '<') return l < r;
  if (op === '>=') return l >= r;
  if (op === '<=') return l <= r;
  if (op === '==') return l === r;
  if (op === '!=') return l !== r;
  throw new Error(`scope-exit: 모르는 연산 ${op}`);
}

export async function scopeExit(ctx0: FacetContext<ScopeExitFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<ScopeExitFacetData>;
  const { lines, stepMs } = ctx.data;
  const bodies = findBodies(lines);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const frames: Frame[] = [{ base: 100, slots: [] }];
  let nextAddr = 100;

  function lookup(name: string): Slot | null {
    for (let f = frames.length - 1; f >= 0; f -= 1) {
      const hit = frames[f].slots.find((s) => s.name === name);
      if (hit) return hit;
    }
    return null;
  }

  /** 식을 셈한다. 찾지 못한 이름이 있으면 그 이름을 돌려준다. */
  type Got = { ok: true; v: Value | boolean } | { ok: false; missing: string };
  function evaluate(e: Expr): Got {
    if ('num' in e) return { ok: true, v: e.num };
    if ('str' in e) return { ok: true, v: e.str };
    if ('var' in e) {
      const s = lookup(e.var);
      return s ? { ok: true, v: s.value } : { ok: false, missing: e.var };
    }
    const l = evaluate(e.l);
    if (!l.ok) return l;
    const r = evaluate(e.r);
    if (!r.ok) return r;
    return { ok: true, v: apply(e.op, l.v as Value, r.v as Value) };
  }

  /** 식이 읽는 이름들 (차례대로, 겹치지 않게). */
  function readsOf(e: Expr, acc: string[] = []): string[] {
    if ('var' in e) {
      if (!acc.includes(e.var)) acc.push(e.var);
    } else if ('op' in e) {
      readsOf(e.l, acc);
      readsOf(e.r, acc);
    }
    return acc;
  }

  /** from..to 줄을 밟는다. 거짓이면 멈췄거나 취소됐다. */
  async function run(from: number, to: number): Promise<boolean> {
    let i = from;
    while (i <= to) {
      if (!(await pause())) return false;
      const line = lines[i];
      const st = line.stmt;
      if (st.k === 'assign') {
        let target: Slot | null;
        if (st.declare) {
          target = { name: st.to, addr: nextAddr, value: 0, slot: i };
          nextAddr += 1;
          frames[frames.length - 1].slots.push(target);
        } else {
          target = lookup(st.to);
          if (!target) {
            await ctx.emit({ type: 'unknownName', payload: { line: i, name: st.to } });
            return false;
          }
        }
        const got = evaluate(st.value);
        if (!got.ok) {
          await ctx.emit({ type: 'unknownName', payload: { line: i, name: got.missing } });
          return false;
        }
        const was = st.declare ? null : target.value;
        target.value = got.v as Value;
        const reads = readsOf(st.value)
          .filter((n) => n !== st.to)
          .map((n) => ({ name: n, slot: (lookup(n) as Slot).slot }));
        await ctx.emit({
          type: 'assign',
          payload: {
            line: i,
            name: target.name,
            addr: target.addr,
            value: target.value,
            was,
            declare: st.declare === true,
            slot: target.slot,
            reads,
          },
        });
        i += 1;
      } else if (st.k === 'if') {
        const l = evaluate(st.cond.l);
        if (!l.ok) {
          await ctx.emit({ type: 'unknownName', payload: { line: i, name: l.missing } });
          return false;
        }
        const r = evaluate(st.cond.r);
        if (!r.ok) {
          await ctx.emit({ type: 'unknownName', payload: { line: i, name: r.missing } });
          return false;
        }
        const result = apply(st.cond.op, l.v as Value, r.v as Value) === true;
        await ctx.emit({
          type: 'branch',
          payload: { line: i, l: l.v, op: st.cond.op, r: r.v, result },
        });
        const body = bodies.find((b) => b.head === i);
        const end = body ? body.to : i;
        if (result && body && body.from <= body.to) {
          frames.push({ base: nextAddr, slots: [] });
          if (!(await run(body.from, body.to))) return false;
          if (!(await pause())) return false;
          const closed = frames.pop() as Frame;
          nextAddr = closed.base;
          await ctx.emit({
            type: 'exit',
            payload: {
              head: i,
              gone: closed.slots.map((s) => ({ name: s.name, addr: s.addr, value: s.value, slot: s.slot })),
            },
          });
        }
        i = end + 1;
      } else {
        const got = evaluate(st.value);
        if (!got.ok) {
          await ctx.emit({ type: 'unknownName', payload: { line: i, name: got.missing } });
          return false;
        }
        const src = 'var' in st.value ? lookup(st.value.var) : null;
        await ctx.emit({
          type: 'show',
          payload: {
            line: i,
            value: got.v as Value,
            from: src ? { name: src.name, slot: src.slot } : null,
          },
        });
        i += 1;
      }
    }
    return true;
  }

  await ctx.emit({
    type: 'init',
    payload: {
      lines: lines.map((ln) => ({ indent: ln.indent, text: ln.text })),
      bodies,
    },
  });
  await run(0, lines.length - 1);
}
