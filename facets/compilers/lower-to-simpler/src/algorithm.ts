/**
 * 낮추기 — 중첩된 식 한 줄을 연산 하나짜리 줄들로 푼다.
 *
 * 떼는 차례는 뒤차례다: 두 피연산자가 다 이름 · 수 · 임시인 연산 가운데 가장 왼쪽 것을 먼저 뗀다.
 * 떼어 낸 연산은 임시 `t1, t2 …` (줄이 생기는 차례)에 넣는 새 줄이 되고, 식 안의 그 자리에는 임시 이름이 남는다.
 * 가장 바깥 연산은 임시를 거치지 않고 넣는 이름(`dst`)에 곧장 쓴다. 다 떼어진 뒤 같은 값을 넣어
 * 원시 식과 줄들을 각각 셈한다.
 *
 * 이벤트 (모두 silent 아님)
 * - `peel`  { path: string; name: string; left: number }
 *     path — 떼어 낼 연산의 자리. 뿌리에서 'l'(왼쪽) · 'r'(오른쪽)을 이은 글자, 뿌리 자신은 ''.
 *     name — 그 줄이 넣는 이름 (임시 `tN`, 가장 바깥 연산이면 dst).
 *     left — 떼어 낸 뒤 원시 식에 남은 연산 수.
 * - `check` { source: number; values: number[] }
 *     source — 원시 식을 env 로 셈한 값. values — 줄마다 넣은 값 (줄 차례).
 *
 * 첫 걸음 앞에 stepMs 를 둔다 — 걸음 0 이 이미 원시 한 줄을 보인다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export const OPS = ['+', '-', '*', '/', '<', '<=', '>', '>=', '==', '!='] as const;
export type Op = (typeof OPS)[number];
export type Leaf = { var: string } | { num: number };
export type Node = { op: Op; l: Expr; r: Expr };
export type Expr = Leaf | Node;

export function isNode(e: Expr): e is Node {
  return 'op' in e;
}

function isOp(v: unknown): v is Op {
  return typeof v === 'string' && (OPS as readonly string[]).includes(v);
}

/** 식 나무를 좁히며 새 객체로 베낀다. 모르는 모양은 자리를 담아 던진다. */
export function readExpr(u: unknown, at: string): Expr {
  if (typeof u !== 'object' || u === null) throw new Error(`lower-to-simpler: 식이 아니다 (${at})`);
  const o = u as Record<string, unknown>;
  if ('op' in o) {
    if (!isOp(o.op)) throw new Error(`lower-to-simpler: 모르는 연산 ${String(o.op)} (${at})`);
    return { op: o.op, l: readExpr(o.l, `${at}.l`), r: readExpr(o.r, `${at}.r`) };
  }
  if ('var' in o) {
    if (typeof o.var !== 'string' || o.var === '') throw new Error(`lower-to-simpler: 이름이 비었다 (${at})`);
    return { var: o.var };
  }
  if ('num' in o) {
    if (typeof o.num !== 'number' || !Number.isFinite(o.num)) throw new Error(`lower-to-simpler: 수가 아니다 (${at})`);
    return { num: o.num };
  }
  throw new Error(`lower-to-simpler: 모르는 식 모양 (${at})`);
}

export type LowerData = { dst: string; expr: Expr; env: Array<[string, number]> };

/** initialData 를 좁힌다 — 넣는 이름 · 식 나무 · 대조 값. */
export function readLowerData(u: unknown): LowerData {
  if (typeof u !== 'object' || u === null) throw new Error('lower-to-simpler: initialData 가 없다');
  const o = u as Record<string, unknown>;
  if (typeof o.dst !== 'string' || o.dst === '') throw new Error('lower-to-simpler: dst 가 없다');
  const expr = readExpr(o.expr, 'expr');
  if (typeof o.env !== 'object' || o.env === null) throw new Error('lower-to-simpler: env 가 없다');
  const env: Array<[string, number]> = [];
  for (const [k, v] of Object.entries(o.env as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`lower-to-simpler: env.${k} 가 수가 아니다`);
    env.push([k, v]);
  }
  return { dst: o.dst, expr, env };
}

/** 자리 글자(`'lr'` = 왼쪽의 오른쪽)가 가리키는 마디. 없는 자리는 던진다. */
export function nodeAt(e: Expr, path: string): Expr {
  let cur = e;
  for (const c of path) {
    if (!isNode(cur)) throw new Error(`lower-to-simpler: 자리 ${path} 에 마디가 없다`);
    cur = c === 'l' ? cur.l : cur.r;
  }
  return cur;
}

/** 자리의 마디를 잎으로 바꾼 새 나무. 앞 나무는 건드리지 않는다. */
export function replaceAt(e: Expr, path: string, leaf: Leaf): Expr {
  if (path === '') return { ...leaf };
  if (!isNode(e)) throw new Error(`lower-to-simpler: 자리 ${path} 에 마디가 없다`);
  const head = path[0];
  const tail = path.slice(1);
  return head === 'l'
    ? { op: e.op, l: replaceAt(e.l, tail, leaf), r: e.r }
    : { op: e.op, l: e.l, r: replaceAt(e.r, tail, leaf) };
}

export function countOps(e: Expr | null): number {
  if (e === null || !isNode(e)) return 0;
  return 1 + countOps(e.l) + countOps(e.r);
}

/** 세 주소 줄 하나 — `dst = l op r` */
export type IrLine = { dst: string; l: Leaf; op: Op; r: Leaf };

export type LowerToSimplerFacetData = {
  type: 'lower-to-simpler';
  stepMs: number;
  /** 넣는 이름 (원시 `let r = …` 의 r) */
  dst: string;
  /** 원시 식 나무 */
  expr: Expr;
  /** 뜻 대조에 넣는 값 (예로 정한 값) */
  env: Record<string, number>;
};

/** 뒤차례로 가장 먼저 끝나는 연산의 자리 — 두 피연산자가 다 잎인 가장 왼쪽 마디. */
function firstPeel(e: Expr, path: string): string {
  if (!isNode(e)) throw new Error(`lower-to-simpler: 자리 ${path} 는 연산이 아니다`);
  if (isNode(e.l)) return firstPeel(e.l, `${path}l`);
  if (isNode(e.r)) return firstPeel(e.r, `${path}r`);
  return path;
}

function apply(op: Op, a: number, b: number): number {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  if (op === '/') {
    if (b === 0) throw new Error('lower-to-simpler: 0 으로 나눈다');
    return a / b;
  }
  throw new Error(`lower-to-simpler: 값 대조가 셈하지 않는 연산 ${op}`);
}

function valueOf(leaf: Leaf, env: Map<string, number>): number {
  if ('num' in leaf) return leaf.num;
  const v = env.get(leaf.var);
  if (v === undefined) throw new Error(`lower-to-simpler: 값이 없는 이름 ${leaf.var}`);
  return v;
}

function evalExpr(e: Expr, env: Map<string, number>): number {
  if (!isNode(e)) return valueOf(e, env);
  return apply(e.op, evalExpr(e.l, env), evalExpr(e.r, env));
}

function leafNames(e: Expr, out: Set<string>): void {
  if (isNode(e)) {
    leafNames(e.l, out);
    leafNames(e.r, out);
  } else if ('var' in e) out.add(e.var);
}

export async function lowerToSimpler(ctx: FacetContext<LowerToSimplerFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<LowerToSimplerFacetData>;
  const stepMs = ctx.data.stepMs;
  const data = readLowerData(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rc.sleep(stepMs)) && !ctx.cancelled;
  }

  const taken = new Set<string>([data.dst]);
  leafNames(data.expr, taken);

  let rest: Expr = data.expr;
  let temps = 0;
  const lines: IrLine[] = [];
  while (isNode(rest)) {
    if (!(await pause())) return;
    const path = firstPeel(rest, '');
    const node = nodeAt(rest, path);
    if (!isNode(node)) throw new Error(`lower-to-simpler: 자리 ${path} 는 연산이 아니다`);
    let name = data.dst;
    if (path !== '') {
      temps += 1;
      name = `t${temps}`;
      if (taken.has(name)) throw new Error(`lower-to-simpler: 임시 이름 ${name} 이 원시 이름과 겹친다`);
    }
    if (isNode(node.l) || isNode(node.r)) throw new Error(`lower-to-simpler: 자리 ${path} 가 잎 둘이 아니다`);
    lines.push({ dst: name, l: node.l, op: node.op, r: node.r });
    rest = replaceAt(rest, path, { var: name });
    await ctx.emit({ type: 'peel', payload: { path, name, left: countOps(isNode(rest) ? rest : null) } });
  }

  if (!(await pause())) return;
  const env = new Map<string, number>(data.env);
  const source = evalExpr(data.expr, env);
  const values: number[] = [];
  for (const line of lines) {
    if (ctx.cancelled) return;
    const v = apply(line.op, valueOf(line.l, env), valueOf(line.r, env));
    env.set(line.dst, v);
    values.push(v);
  }
  await ctx.emit({ type: 'check', payload: { source, values } });
}
