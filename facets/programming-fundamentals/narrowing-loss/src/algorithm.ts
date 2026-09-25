/**
 * narrowing-loss 알고리즘 — 넓은 정수를 좁은 정수로 바꾸면 윗자리가 잘려 떨어진다.
 *
 * `initialData.lines` 의 줄 구조를 위에서 아래로 해석한다. 줄 하나를 밟는 것이 한 걸음이다.
 * `int8(x)` 는 x 의 아래 8 비트만 남겨 부호 있는 수로 읽는다 — `((x + 128) mod 256) - 128`.
 *
 * 발신 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *   init     { lines: { indent: number; text: string }[];
 *              slots: { name: string; type: string; bits: number }[] }
 *            걸음 0. 프로그램 전체와 선언될 자리들(선언 차례대로). 아직 아무 줄도 밟지 않았다
 *   declare  { line: number; name: string; value: number }
 *            `let 이름: 타입 = 식` 에서 식이 변환이 아닌 줄. line 은 0 부터 센 줄 차례
 *   convert  { line: number; name: string; from: string; before: number; value: number; lost: number }
 *            `let 이름: int8 = int8(원본)` 줄. before 는 원본 값, value 는 바뀐 뒤 값,
 *            lost 는 잃은 크기 (before - value)
 *   output   { line: number; name: string | null; value: number }
 *            `show 식` 줄. 식이 이름 하나면 name 에 그 이름
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NarrowingExpr =
  | { num: number }
  | { var: string }
  | { call: string; args: NarrowingExpr[] };

export type NarrowingStmt =
  | { k: 'assign'; to: string; value: NarrowingExpr; declare?: boolean; type?: string }
  | { k: 'show'; value: NarrowingExpr };

export type NarrowingLine = { indent: number; text: string; stmt: NarrowingStmt };

export type NarrowingLossFacetData = {
  type: 'narrowing-loss';
  stepMs: number;
  lines: NarrowingLine[];
};

/** 타입마다 자리의 비트 수. */
const TYPE_BITS: Record<string, number> = { int32: 32, int8: 8 };

function typeBits(type: string): number {
  const bits = TYPE_BITS[type];
  if (bits === undefined) throw new Error(`narrowing-loss: 모르는 타입 ${type}`);
  return bits;
}

/** 부호 있는 bits 비트 정수로 읽기 — 아래 bits 비트만 남긴다. */
function narrow(x: number, bits: number): number {
  const span = 2 ** bits;
  const half = span / 2;
  return ((((x + half) % span) + span) % span) - half;
}

function fits(x: number, bits: number): boolean {
  const half = 2 ** (bits - 1);
  return x >= -half && x < half;
}

type Env = Map<string, { type: string; value: number }>;

function evaluate(expr: NarrowingExpr, env: Env): number {
  if ('num' in expr) return expr.num;
  if ('var' in expr) {
    const slot = env.get(expr.var);
    if (!slot) throw new Error(`narrowing-loss: 없는 이름 ${expr.var}`);
    return slot.value;
  }
  const arg = expr.args[0];
  if (arg === undefined) throw new Error(`narrowing-loss: ${expr.call} 에 인자가 없다`);
  return narrow(evaluate(arg, env), typeBits(expr.call));
}

export async function narrowingLoss(ctx: FacetContext<NarrowingLossFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<NarrowingLossFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const slots: { name: string; type: string; bits: number }[] = [];
  for (const line of lines) {
    if (ctx.cancelled) return;
    const s = line.stmt;
    if (s.k === 'assign' && s.declare && s.type) {
      slots.push({ name: s.to, type: s.type, bits: typeBits(s.type) });
    }
  }

  await ctx.emit({
    type: 'init',
    payload: { lines: lines.map((l) => ({ indent: l.indent, text: l.text })), slots },
  });

  const env: Env = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    if (!(await pause())) return;
    const s = lines[i]!.stmt;
    if (s.k === 'show') {
      const value = evaluate(s.value, env);
      const name = 'var' in s.value ? s.value.var : null;
      await ctx.emit({ type: 'output', payload: { line: i, name, value } });
      continue;
    }
    const type = s.declare && s.type ? s.type : env.get(s.to)?.type;
    if (type === undefined) throw new Error(`narrowing-loss: 선언 없이 쓰는 이름 ${s.to}`);
    const value = evaluate(s.value, env);
    if (!fits(value, typeBits(type))) {
      throw new Error(`narrowing-loss: ${type} 자리에 ${value} 는 들어가지 않는다`);
    }
    env.set(s.to, { type, value });
    const src = s.value;
    if ('call' in src && src.args[0] !== undefined && 'var' in src.args[0]) {
      const from = src.args[0].var;
      const before = env.get(from)!.value;
      await ctx.emit({
        type: 'convert',
        payload: { line: i, name: s.to, from, before, value, lost: before - value },
      });
    } else {
      await ctx.emit({ type: 'declare', payload: { line: i, name: s.to, value } });
    }
  }
}
