/**
 * base-case 의 장면.
 *
 * 바탕 — 코드 줄 · 틀 한도 · 바닥 조건 · n 이 지나는 범위 (init 이 한 번 정한다)
 * 자취 — 살아 있는 틀(`stack`) · 지나간 틀의 발자국(`trail`) · 바깥에 돌아온 값(`results`) · 넘침(`failed`)
 * 이번 걸음 — `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type Shown = string | number | null;

export type BaseCaseBase = {
  lines: { indent: number; text: string }[];
  maxFrames: number;
  fn: string;
  test: string;
  floor: number | null;
  lo: number;
  hi: number;
};

/** 살아 있는 틀. `origin` 은 이 사슬을 연 바깥 줄(1 부터). `got` 은 아래 틀이 돌려준 값을 받아 쥔 것. */
export type LiveFrame = { n: number; depth: number; origin: number; got: { value: Shown } | null };

/** 들어갔던 자리. `origin`(바깥에서 부른 줄)이 같은 발자국끼리 한 번의 바깥 부르기에서 나왔다. */
export type Footprint = { n: number; depth: number; origin: number; hit: boolean };

/** 부모에서 이 틀로 n 이 어떻게 움직였나 — 바닥 값을 기준으로. */
export type Drift = 'first' | 'toward' | 'across' | 'away' | 'land';

export type BaseCaseStep =
  | { kind: 'start' }
  | { kind: 'enter'; n: number; depth: number; line: number; hit: boolean; drift: Drift } // line = 사슬을 연 바깥 줄
  | { kind: 'return'; depth: number; line: number; value: Shown; into: string | null }
  | { kind: 'overflow'; n: number; depth: number; line: number; error: string };

export type BaseCaseScene = {
  base: BaseCaseBase | null;
  stack: LiveFrame[];
  trail: Footprint[];
  results: { line: number; value: Shown; into: string | null }[];
  failed: { line: number; n: number; depth: number; error: string } | null;
  step: BaseCaseStep;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const shown = (v: unknown): Shown => (typeof v === 'string' || typeof v === 'number' ? v : null);

function readBase(p: { [k: string]: unknown }): BaseCaseBase | null {
  const maxFrames = num(p.maxFrames);
  const lo = num(p.lo);
  const hi = num(p.hi);
  if (maxFrames === null || lo === null || hi === null || !Array.isArray(p.lines)) return null;
  const lines: BaseCaseBase['lines'] = [];
  for (const raw of p.lines as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const l = raw as { indent?: unknown; text?: unknown };
    const indent = num(l.indent);
    const text = str(l.text);
    if (indent !== null && text !== null) lines.push({ indent, text });
  }
  return {
    lines,
    maxFrames,
    fn: str(p.fn) ?? '',
    test: str(p.test) ?? '',
    floor: num(p.floor),
    lo,
    hi,
  };
}

function driftOf(from: number | null, n: number, floor: number | null, hit: boolean): Drift {
  if (hit) return 'land';
  if (from === null || floor === null) return 'first';
  const a = from - floor;
  const b = n - floor;
  if (a * b < 0) return 'across';
  return Math.abs(b) < Math.abs(a) ? 'toward' : 'away';
}

function empty(): BaseCaseScene {
  return { base: null, stack: [], trail: [], results: [], failed: null, step: { kind: 'start' } };
}

export const baseCaseScene: ScenePlan<BaseCaseScene> = {
  initial(): BaseCaseScene {
    return empty();
  },

  reduce(scene: BaseCaseScene, event: FacetRuntimeEvent): BaseCaseScene {
    const p = (typeof event.payload === 'object' && event.payload !== null ? event.payload : {}) as {
      [k: string]: unknown;
    };

    if (event.type === 'init') {
      return { ...empty(), base: readBase(p) };
    }

    if (event.type === 'enter') {
      const n = num(p.n);
      const depth = num(p.depth);
      const line = num(p.line);
      if (n === null || depth === null || line === null) return scene;
      const hit = p.test === true;
      const parent = scene.stack[scene.stack.length - 1];
      const origin = parent ? parent.origin : line;
      const drift = driftOf(parent ? parent.n : null, n, scene.base?.floor ?? null, hit);
      return {
        ...scene,
        stack: [...scene.stack, { n, depth, origin, got: null }],
        trail: [...scene.trail, { n, depth, origin, hit }],
        step: { kind: 'enter', n, depth, line: origin, hit, drift },
      };
    }

    if (event.type === 'return') {
      const depth = num(p.depth);
      const line = num(p.line);
      if (depth === null || line === null) return scene;
      const value = shown(p.value);
      const into = str(p.into);
      const stack = scene.stack.slice(0, -1);
      const top = stack[stack.length - 1];
      if (top) stack[stack.length - 1] = { ...top, got: { value } };
      const origin = scene.stack[0]?.origin ?? line;
      const results = top ? scene.results : [...scene.results, { line: origin, value, into }];
      return { ...scene, stack, results, step: { kind: 'return', depth, line: origin, value, into } };
    }

    if (event.type === 'overflow') {
      const n = num(p.n);
      const depth = num(p.depth);
      const line = num(p.line);
      const error = str(p.error) ?? '';
      if (n === null || depth === null || line === null) return scene;
      const outer = scene.stack[0]?.origin ?? line;
      return {
        ...scene,
        failed: { line: outer, n, depth, error },
        step: { kind: 'overflow', n, depth, line: outer, error },
      };
    }

    return scene;
  },
};
