/**
 * call-stack-unwind 의 장면.
 *
 * 바탕  lines — 첫 장면이 initialData 에서 값을 베껴 정한다
 *       maxDepth — 알고리즘이 셈해 push 에 실어 보낸 값을 쥐기만 한다 (시작 장면은 0)
 * 자취  frames — 선 적 있는 틀 전부 (선 차례대로). 걷힌 틀은 popOrd 를 가진 채 남는다
 *       outer  — 바깥(깊이 0)이 기다리는 줄과 그 빈자리
 * 이번 걸음  step — 시작 · 선 틀 · 걷힌 틀
 *
 * 좌표 · 문안 · DOM 은 담지 않는다 (S-scene).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { CodeLine, Expr, Stmt, Value } from './algorithm.js';

export type { CodeLine, Expr, Stmt, Value } from './algorithm.js';

/** 틀이 부른 자리의 빈칸. `null` 이면 아직 비어 있다. */
export type Slot = { value: Value } | null;

export type FrameScene = {
  fn: string;
  /** 틀의 변수 — 매개변수와 인자 값 */
  vars: [string, Value][];
  depth: number;
  /** 이 틀을 부른 줄 (0 부터) */
  callLine: number;
  /** 선 차례 (1 부터) */
  pushOrd: number;
  /** 이 틀이 부르고 기다리는 줄 (0 부터). 아직 부르지 않았으면 null */
  waitLine: number | null;
  slot: Slot;
  /** 걷힌 차례 (1 부터). 아직 서 있으면 null */
  popOrd: number | null;
  /** 돌려준 return 줄 (0 부터). 걷히지 않았거나 몸 끝으로 돌아갔으면 null */
  retLine: number | null;
  /** 돌려준 값 */
  returned: Value;
};

export type OuterScene = { waitLine: number | null; slot: Slot };

export type CallStackUnwindStep =
  | { kind: 'start' }
  | { kind: 'push'; frame: number }
  /** into — 값을 받은 틀의 번호. 바깥이면 -1 */
  | { kind: 'pop'; frame: number; into: number };

export type CallStackUnwindScene = {
  lines: CodeLine[];
  maxDepth: number;
  frames: FrameScene[];
  outer: OuterScene;
  step: CallStackUnwindStep;
};

// ---------- 좁히개 ----------

function isValue(v: unknown): v is Value {
  return v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean';
}

function toExpr(v: unknown): Expr | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.num === 'number') return { num: o.num };
  if (typeof o.str === 'string') return { str: o.str };
  if (typeof o.var === 'string') return { var: o.var };
  if (typeof o.op === 'string') {
    const l = toExpr(o.l);
    const r = toExpr(o.r);
    const ops = ['+', '-', '*', '<', '<=', '>', '>=', '==', '!='] as const;
    const op = ops.find((x) => x === o.op);
    if (l === null || r === null || op === undefined) return null;
    return { op, l, r };
  }
  if (typeof o.call === 'string' && Array.isArray(o.args)) {
    const args: Expr[] = [];
    for (const a of o.args) {
      const e = toExpr(a);
      if (e === null) return null;
      args.push(e);
    }
    return { call: o.call, args };
  }
  return null;
}

function toStmt(v: unknown): Stmt | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  switch (o.k) {
    case 'assign': {
      const value = toExpr(o.value);
      if (typeof o.to !== 'string' || value === null) return null;
      return o.declare === true
        ? { k: 'assign', to: o.to, value, declare: true }
        : { k: 'assign', to: o.to, value };
    }
    case 'expr': {
      const value = toExpr(o.value);
      return value !== null ? { k: 'expr', value } : null;
    }
    case 'if':
    case 'elif':
    case 'while': {
      const cond = toExpr(o.cond);
      return cond !== null ? { k: o.k, cond } : null;
    }
    case 'else':
      return { k: 'else' };
    case 'def':
      return typeof o.name === 'string' &&
        Array.isArray(o.params) &&
        o.params.every((p) => typeof p === 'string')
        ? { k: 'def', name: o.name, params: o.params.map(String) }
        : null;
    case 'return': {
      if (o.value === undefined) return { k: 'return' };
      const value = toExpr(o.value);
      return value !== null ? { k: 'return', value } : null;
    }
    default:
      return null;
  }
}

/** initialData 에서 줄 목록을 **베껴** 꺼낸다. 모양이 어긋나면 빈 목록. */
export function readLines(data: unknown): CodeLine[] {
  if (typeof data !== 'object' || data === null) return [];
  const raw = (data as Record<string, unknown>).lines;
  if (!Array.isArray(raw)) return [];
  const out: CodeLine[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) return [];
    const o = r as Record<string, unknown>;
    const stmt = toStmt(o.stmt);
    if (typeof o.indent !== 'number' || typeof o.text !== 'string' || stmt === null) return [];
    out.push({ indent: o.indent, text: o.text, stmt });
  }
  return out;
}

// ---------- 장면 ----------

/** 서 있는 틀 가운데 깊이 d 인 것의 번호 (가장 나중에 선 것) */
function liveAt(frames: readonly FrameScene[], d: number): number {
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const f = frames[i]!;
    if (f.depth === d && f.popOrd === null) return i;
  }
  return -1;
}

function paramsOf(lines: readonly CodeLine[], fn: string): string[] {
  for (const l of lines) {
    if (l.stmt.k === 'def' && l.stmt.name === fn) return [...l.stmt.params];
  }
  return [];
}

export const callStackUnwindScene: ScenePlan<CallStackUnwindScene> = {
  initial(initialData: unknown): CallStackUnwindScene {
    const lines = readLines(initialData);
    return {
      lines,
      maxDepth: 0,
      frames: [],
      outer: { waitLine: null, slot: null },
      step: { kind: 'start' },
    };
  },

  reduce(scene: CallStackUnwindScene, event: FacetRuntimeEvent): CallStackUnwindScene {
    const p = event.payload;
    if (typeof p !== 'object' || p === null) return scene;
    const o = p as Record<string, unknown>;

    if (event.type === 'push') {
      const fn = o.fn;
      const args = o.args;
      const callLine = o.callLine;
      const depth = o.depth;
      const maxDepth = o.maxDepth;
      if (
        typeof maxDepth !== 'number' ||
        typeof fn !== 'string' ||
        !Array.isArray(args) ||
        !args.every(isValue) ||
        typeof callLine !== 'number' ||
        typeof depth !== 'number'
      ) {
        return scene;
      }
      const params = paramsOf(scene.lines, fn);
      const vars: [string, Value][] = params.map((name, j) => [name, args[j] ?? null]);
      const frames = scene.frames.map((f) => ({ ...f }));
      let outer = scene.outer;
      const caller = liveAt(frames, depth - 1);
      if (depth - 1 === 0) outer = { waitLine: callLine, slot: null };
      else if (caller >= 0) frames[caller] = { ...frames[caller]!, waitLine: callLine, slot: null };
      frames.push({
        fn,
        vars,
        depth,
        callLine,
        pushOrd: scene.frames.length + 1,
        waitLine: null,
        slot: null,
        popOrd: null,
        retLine: null,
        returned: null,
      });
      return {
        ...scene,
        maxDepth,
        frames,
        outer,
        step: { kind: 'push', frame: frames.length - 1 },
      };
    }

    if (event.type === 'pop') {
      const depth = o.depth;
      const value = o.value;
      const retLine = o.retLine;
      if (
        typeof depth !== 'number' ||
        !isValue(value) ||
        !(retLine === null || typeof retLine === 'number')
      ) {
        return scene;
      }
      const frames = scene.frames.map((f) => ({ ...f }));
      const me = liveAt(frames, depth);
      if (me < 0) return scene;
      const popped = frames.filter((f) => f.popOrd !== null).length;
      frames[me] = { ...frames[me]!, popOrd: popped + 1, retLine, returned: value };
      let outer = scene.outer;
      let into = -1;
      if (depth - 1 === 0) {
        outer = { ...outer, slot: { value } };
      } else {
        into = liveAt(frames, depth - 1);
        if (into >= 0) frames[into] = { ...frames[into]!, slot: { value } };
      }
      return { ...scene, frames, outer, step: { kind: 'pop', frame: me, into } };
    }

    return scene;
  },
};
