/**
 * loop-termination 의 장면.
 *
 * 바탕(init 이 한 번 정한다) — 줄 글자 · 루프 줄 · 조건이 읽는 변수 · 몸이 쓰는 변수 ·
 *   그 겹침 · 변수 이름 · 상한.
 * 자취(걸음이 쌓는다) — 변수의 지금 값 · 조건 셈의 기록(셈마다 답과 그때 변수 값) ·
 *   밟은 줄 · 지금 줄 · 재생이 멈췄는가.
 * 이번 걸음(`step`) — 무엇이 일어났는가와 흐름이 떠난 줄(`from`).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type LtValue = number | string;

export type LtBase = {
  lines: { indent: number; text: string }[];
  loop: number;
  reads: string[];
  writes: string[];
  overlap: string[];
  names: string[];
  cap: number;
};

/** 조건 셈 한 번의 기록. `vars` 는 그때 변수 값 (이름 차례는 base.names 를 따른다). */
export type LtCheck = {
  count: number;
  answer: boolean;
  shown: string;
  vars: [string, LtValue | null][];
};

export type LtStep =
  | { kind: 'start' }
  | { kind: 'assign'; line: number; from: number | null; name: string }
  | { kind: 'cond'; line: number; from: number | null; count: number }
  | { kind: 'expr'; line: number; from: number | null };

export type LoopTerminationScene = {
  base: LtBase | null;
  vars: [string, LtValue | null][];
  checks: LtCheck[];
  visited: number[];
  at: number | null;
  halted: boolean;
  step: LtStep;
};

function empty(): LoopTerminationScene {
  return { base: null, vars: [], checks: [], visited: [], at: null, halted: false, step: { kind: 'start' } };
}

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function readBase(p: Record<string, unknown>): LtBase {
  const lines: LtBase['lines'] = [];
  if (Array.isArray(p.lines)) {
    for (const raw of p.lines) {
      const l = rec(raw);
      if (l && typeof l.text === 'string') lines.push({ indent: num(l.indent, 0), text: l.text });
    }
  }
  return {
    lines,
    loop: num(p.loop, -1),
    reads: strings(p.reads),
    writes: strings(p.writes),
    overlap: strings(p.overlap),
    names: strings(p.names),
    cap: num(p.cap, 0),
  };
}

function visit(visited: number[], line: number): number[] {
  return visited.includes(line) ? visited.slice() : [...visited, line];
}

export const loopTerminationScene: ScenePlan<LoopTerminationScene> = {
  initial(): LoopTerminationScene {
    return empty();
  },

  reduce(scene: LoopTerminationScene, event: FacetRuntimeEvent): LoopTerminationScene {
    const p = rec(event.payload);
    if (event.type === 'init' && p) {
      const base = readBase(p);
      return {
        ...empty(),
        base,
        vars: base.names.map((n): [string, LtValue | null] => [n, null]),
      };
    }
    if (!p || typeof p.line !== 'number') return scene;
    const line = p.line;
    const from = scene.at;

    if (event.type === 'assign' && typeof p.name === 'string') {
      const name = p.name;
      const value: LtValue | null =
        typeof p.value === 'number' || typeof p.value === 'string' ? p.value : null;
      const vars: [string, LtValue | null][] = scene.vars.some(([n]) => n === name)
        ? scene.vars.map(([n, v]): [string, LtValue | null] => [n, n === name ? value : v])
        : [...scene.vars.map(([n, v]): [string, LtValue | null] => [n, v]), [name, value]];
      return {
        ...scene,
        vars,
        checks: scene.checks.slice(),
        visited: visit(scene.visited, line),
        at: line,
        step: { kind: 'assign', line, from, name },
      };
    }

    if (event.type === 'cond' && typeof p.count === 'number') {
      const check: LtCheck = {
        count: p.count,
        answer: p.answer === true,
        shown: typeof p.shown === 'string' ? p.shown : '',
        vars: scene.vars.map(([n, v]): [string, LtValue | null] => [n, v]),
      };
      return {
        ...scene,
        vars: scene.vars.map(([n, v]): [string, LtValue | null] => [n, v]),
        checks: [...scene.checks, check],
        visited: visit(scene.visited, line),
        at: line,
        halted: p.halt === true,
        step: { kind: 'cond', line, from, count: p.count },
      };
    }

    if (event.type === 'expr') {
      return {
        ...scene,
        vars: scene.vars.map(([n, v]): [string, LtValue | null] => [n, v]),
        checks: scene.checks.slice(),
        visited: visit(scene.visited, line),
        at: line,
        step: { kind: 'expr', line, from },
      };
    }
    return scene;
  },
};
