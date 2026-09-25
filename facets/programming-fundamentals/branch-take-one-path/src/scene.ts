/**
 * branchTakeOnePathScene — 줄 걸음 이벤트를 장면으로 잇는다.
 *
 * 바탕 : `lines` (init 이 한 번 정한다)
 * 자취 : `trail`(밟은 줄의 차례) · `conds`(셈한 조건) · `vars`(생긴 변수, 생긴 차례) ·
 *        `output` · `done`
 * 이번 걸음 : `step` — 무엇을 했는지와 어디서 왔는지(`from`)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { BinOp, Expr, Line, Stmt, Value } from './algorithm.js';

export type { Expr, Line, Stmt, Value };

export type VarCell = { name: string; value: Value };

export type CondMark = { line: number; cond: boolean; operands: [Value, Value] | null };

export type StepInfo =
  | {
      kind: 'assign';
      line: number;
      from: number | null;
      name: string;
      value: Value;
      created: boolean;
    }
  | { kind: 'cond'; line: number; from: number | null; cond: boolean }
  | { kind: 'print'; line: number; from: number | null; out: string; rejoin: boolean }
  | { kind: 'line'; line: number; from: number | null };

export type BranchScene = {
  lines: Line[];
  trail: number[];
  conds: CondMark[];
  vars: VarCell[];
  output: string[];
  done: boolean;
  step: StepInfo | null;
};

const OPS: readonly BinOp[] = ['+', '-', '*', '<', '<=', '>', '>=', '==', '!='];

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function isValue(x: unknown): x is Value {
  return x === null || typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean';
}

function readExpr(x: unknown): Expr | null {
  if (!isRecord(x)) return null;
  if (typeof x.num === 'number') return { num: x.num };
  if (typeof x.str === 'string') return { str: x.str };
  if (typeof x.var === 'string') return { var: x.var };
  if (typeof x.op === 'string') {
    const op = OPS.find((o) => o === x.op);
    const l = readExpr(x.l);
    const r = readExpr(x.r);
    return op && l && r ? { op, l, r } : null;
  }
  if (typeof x.call === 'string' && Array.isArray(x.args)) {
    const args: Expr[] = [];
    for (const a of x.args) {
      const e = readExpr(a);
      if (!e) return null;
      args.push(e);
    }
    return { call: x.call, args };
  }
  return null;
}

function readStmt(x: unknown): Stmt | null {
  if (!isRecord(x)) return null;
  switch (x.k) {
    case 'assign': {
      const value = readExpr(x.value);
      return typeof x.to === 'string' && value ? { k: 'assign', to: x.to, value } : null;
    }
    case 'expr': {
      const value = readExpr(x.value);
      return value ? { k: 'expr', value } : null;
    }
    case 'if':
    case 'elif': {
      const cond = readExpr(x.cond);
      if (!cond) return null;
      return x.k === 'if' ? { k: 'if', cond } : { k: 'elif', cond };
    }
    case 'else':
      return { k: 'else' };
    default:
      return null;
  }
}

/** 줄 목록을 값으로 베껴 읽는다. 모양이 어긋나면 빈 목록. */
export function readLines(x: unknown): Line[] {
  if (!Array.isArray(x)) return [];
  const out: Line[] = [];
  for (const item of x) {
    if (!isRecord(item)) return [];
    const stmt = readStmt(item.stmt);
    if (typeof item.indent !== 'number' || typeof item.text !== 'string' || !stmt) return [];
    out.push({ indent: item.indent, text: item.text, stmt });
  }
  return out;
}

function empty(): BranchScene {
  return { lines: [], trail: [], conds: [], vars: [], output: [], done: false, step: null };
}

function lastTop(lines: readonly Line[]): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i]!.indent === 0) return i;
  }
  return -1;
}

function reduceStep(scene: BranchScene, p: Record<string, unknown>): BranchScene {
  const line = p.line;
  if (typeof line !== 'number') return scene;
  const src = scene.lines[line];
  if (!src) return scene;
  const from = scene.trail.length > 0 ? scene.trail[scene.trail.length - 1]! : null;
  const trail = [...scene.trail, line];
  const done = src.indent === 0 && line === lastTop(scene.lines);
  const base = { ...scene, trail, done };

  if (typeof p.cond === 'boolean' && (src.stmt.k === 'if' || src.stmt.k === 'elif')) {
    const ops = p.operands;
    const operands: [Value, Value] | null =
      Array.isArray(ops) && ops.length === 2 && isValue(ops[0]) && isValue(ops[1])
        ? [ops[0], ops[1]]
        : null;
    return {
      ...base,
      conds: [...scene.conds, { line, cond: p.cond, operands }],
      step: { kind: 'cond', line, from, cond: p.cond },
    };
  }
  if (src.stmt.k === 'assign' && isValue(p.value)) {
    const name = src.stmt.to;
    const value = p.value;
    const has = scene.vars.some((v) => v.name === name);
    const vars = has
      ? scene.vars.map((v) => (v.name === name ? { name, value } : { ...v }))
      : [...scene.vars.map((v) => ({ ...v })), { name, value }];
    return { ...base, vars, step: { kind: 'assign', line, from, name, value, created: !has } };
  }
  if (typeof p.out === 'string') {
    const prevLine = from === null ? null : scene.lines[from];
    const rejoin = src.indent === 0 && !!prevLine && prevLine.indent > 0;
    return {
      ...base,
      output: [...scene.output, p.out],
      step: { kind: 'print', line, from, out: p.out, rejoin },
    };
  }
  return { ...base, step: { kind: 'line', line, from } };
}

export const branchTakeOnePathScene: ScenePlan<BranchScene> = {
  initial(): BranchScene {
    return empty();
  },
  reduce(scene: BranchScene, event: FacetRuntimeEvent): BranchScene {
    const p = event.payload;
    if (!isRecord(p)) return scene;
    if (event.type === 'init') return { ...empty(), lines: readLines(p.lines) };
    if (event.type === 'step') return reduceStep(scene, p);
    return scene;
  },
};
