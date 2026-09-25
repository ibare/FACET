/**
 * 예외 전파의 장면.
 *
 * 바탕  — 줄 구조(`lines`). init 이 한 번 정한다
 * 자취  — 선 틀과 건너뛴 틀(`frames`), 밟은 줄, 밟지 않게 된 줄, 예외가 지나온 자리, 출력
 * 이번 걸음 — `step`. 계기값 `from` 은 앞 걸음이 서 있던 줄이다
 *
 * 좌표 · 문안 · DOM 은 담지 않는다. 줄을 어느 덩이(맨 바깥 · 함수마다)에 두는지와 그 덩이의
 * 층(부르는 차례)은 바탕에서 결정되므로 장면에 담지 않는다. 그림이 `blocksOf` 로 바탕에서 셈한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneValue = number | string | null;

export type SceneLine = {
  indent: number;
  text: string;
  k: string;
  name: string | null;
  params: string[];
  calls: string[];
};

export type SceneFrame = {
  fn: string;
  /** 이 틀을 세운 부른 줄 */
  callLine: number;
  args: SceneValue[];
  /** 'live' 서 있다 · 'passed' 예외가 잡지 않고 건너뛰어 떠났다 */
  state: 'live' | 'passed';
};

export type SceneStep =
  | { kind: 'start' }
  | { kind: 'enter'; line: number; from: number | null }
  | { kind: 'call'; line: number; from: number | null; fn: string }
  | { kind: 'test'; line: number; from: number | null; value: boolean }
  | { kind: 'assign'; line: number; from: number | null; to: string; value: SceneValue }
  | { kind: 'show'; line: number; from: number | null; out: string }
  | { kind: 'line'; line: number; from: number | null }
  | { kind: 'return'; line: number; from: number | null }
  | { kind: 'throw'; line: number; from: number | null; error: string }
  | {
      kind: 'arrive';
      line: number;
      from: number | null;
      error: string;
      left: string;
      caught: boolean;
    }
  | { kind: 'catch'; line: number; from: number | null; error: string };

export type SceneException = {
  error: string;
  /** 예외가 선 줄부터 닿은 줄들, 잡은 catch 줄까지 */
  path: number[];
  caught: boolean;
};

export type ExceptionPropagateScene = {
  lines: SceneLine[];
  frames: SceneFrame[];
  visited: number[];
  skipped: number[];
  exc: SceneException | null;
  out: string[];
  cur: number | null;
  step: SceneStep;
};

/** 줄 덩이 — 맨 바깥(fn null) 과 함수마다 하나. level = 부르는 차례의 층. */
export type SceneBlock = { fn: string | null; level: number; lines: number[] };

/**
 * 줄을 덩이로 가르고 층을 매긴다. 맨 바깥이 0 층, 맨 바깥에서 부르는 함수가 1 층,
 * 그 함수가 부르는 함수가 2 층. 아무도 부르지 않는 함수는 맨 아래 층 다음에 둔다.
 * 순서는 층, 같은 층이면 정의 차례.
 */
export function blocksOf(lines: readonly SceneLine[]): SceneBlock[] {
  const owner: (string | null)[] = [];
  let fn: string | null = null;
  let defIndent = -1;
  lines.forEach((l) => {
    if (fn !== null && l.indent <= defIndent) fn = null;
    if (l.k === 'function' && l.name !== null) {
      fn = l.name;
      defIndent = l.indent;
    }
    owner.push(fn);
  });
  const names: (string | null)[] = [null];
  for (const o of owner) if (o !== null && !names.includes(o)) names.push(o);

  const level = new Map<string | null, number>([[null, 0]]);
  let frontier: (string | null)[] = [null];
  let depth = 0;
  while (frontier.length > 0 && depth < names.length) {
    depth += 1;
    const next: (string | null)[] = [];
    for (const f of frontier) {
      lines.forEach((l, i) => {
        if (owner[i] !== f) return;
        for (const c of l.calls) {
          if (!names.includes(c) || level.has(c)) continue;
          level.set(c, depth);
          next.push(c);
        }
      });
    }
    frontier = next;
  }
  let deepest = 0;
  for (const v of level.values()) deepest = Math.max(deepest, v);
  const blocks = names.map((n) => ({
    fn: n,
    level: level.get(n) ?? deepest + 1,
    lines: owner.flatMap((o, i) => (o === n ? [i] : [])),
  }));
  return blocks
    .map((b, order) => ({ b, order }))
    .sort((p, q) => p.b.level - q.b.level || p.order - q.order)
    .map((p) => p.b);
}

const EMPTY: ExceptionPropagateScene = {
  lines: [],
  frames: [],
  visited: [],
  skipped: [],
  exc: null,
  out: [],
  cur: null,
  step: { kind: 'start' },
};

function rec(p: unknown): Record<string, unknown> {
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : -1;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function value(v: unknown): SceneValue {
  return typeof v === 'number' || typeof v === 'string' ? v : null;
}
function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}
function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function readLines(v: unknown): SceneLine[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw) => {
    const r = rec(raw);
    return {
      indent: num(r.indent) < 0 ? 0 : num(r.indent),
      text: str(r.text),
      k: str(r.k),
      name: typeof r.name === 'string' ? r.name : null,
      params: strs(r.params),
      calls: strs(r.calls),
    };
  });
}

function visit(visited: number[], line: number): number[] {
  return visited.includes(line) ? visited : [...visited, line];
}

/** 서 있는 틀 가운데 맨 위 하나의 자리. */
function lastLive(frames: readonly SceneFrame[]): number {
  for (let i = frames.length - 1; i >= 0; i -= 1) if (frames[i].state === 'live') return i;
  return -1;
}

export const exceptionPropagateScene: ScenePlan<ExceptionPropagateScene> = {
  initial(): ExceptionPropagateScene {
    return EMPTY;
  },

  reduce(scene: ExceptionPropagateScene, event: FacetRuntimeEvent): ExceptionPropagateScene {
    const p = rec(event.payload);
    if (event.type === 'init') {
      return { ...EMPTY, lines: readLines(p.lines) };
    }
    const line = num(p.line);
    if (line < 0) return scene;
    const from = scene.cur;
    const base = { ...scene, cur: line };

    switch (event.type) {
      case 'enter':
        return { ...base, visited: visit(scene.visited, line), step: { kind: 'enter', line, from } };
      case 'call': {
        const fn = str(p.fn);
        const args = Array.isArray(p.args) ? p.args.map(value) : [];
        return {
          ...base,
          visited: visit(scene.visited, line),
          frames: [...scene.frames, { fn, callLine: line, args, state: 'live' }],
          step: { kind: 'call', line, from, fn },
        };
      }
      case 'test':
        return {
          ...base,
          visited: visit(scene.visited, line),
          step: { kind: 'test', line, from, value: p.value === true },
        };
      case 'assign':
        return {
          ...base,
          visited: visit(scene.visited, line),
          step: { kind: 'assign', line, from, to: str(p.to), value: value(p.value) },
        };
      case 'show': {
        const out = str(p.out);
        return {
          ...base,
          visited: visit(scene.visited, line),
          out: [...scene.out, out],
          step: { kind: 'show', line, from, out },
        };
      }
      case 'line':
        return { ...base, visited: visit(scene.visited, line), step: { kind: 'line', line, from } };
      case 'return': {
        const at = lastLive(scene.frames);
        return {
          ...base,
          visited: visit(scene.visited, line),
          frames: at < 0 ? scene.frames : scene.frames.filter((_, i) => i !== at),
          step: { kind: 'return', line, from },
        };
      }
      case 'throw': {
        const error = str(p.error);
        return {
          ...base,
          visited: visit(scene.visited, line),
          exc: { error, path: [line], caught: false },
          step: { kind: 'throw', line, from, error },
        };
      }
      case 'arrive': {
        const error = str(p.error);
        const at = lastLive(scene.frames);
        const path = scene.exc === null ? [line] : [...scene.exc.path, line];
        return {
          ...base,
          frames: scene.frames.map((f, i) => (i === at ? { ...f, state: 'passed' } : f)),
          skipped: [...scene.skipped, ...nums(p.skipped)],
          exc: { error, path, caught: false },
          step: { kind: 'arrive', line, from, error, left: str(p.left), caught: p.caught === true },
        };
      }
      case 'catch': {
        const error = str(p.error);
        const path = scene.exc === null ? [line] : [...scene.exc.path, line];
        return {
          ...base,
          visited: visit(scene.visited, line),
          skipped: [...scene.skipped, ...nums(p.skipped)],
          exc: { error, path, caught: true },
          step: { kind: 'catch', line, from, error },
        };
      }
      default:
        return scene;
    }
  },
};
