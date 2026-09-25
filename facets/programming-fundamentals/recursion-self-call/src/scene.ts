/**
 * recursion-self-call 장면.
 *
 * 바탕 — 프로그램 줄(`rows`) · 부르는 함수 이름 · 매개변수 · 멈출 때까지 쌓일 가장 깊은 깊이.
 * 자취 — 선 틀들(`frames`, 깊이 1 부터 차례로)과 틀마다 밟은 줄 · 셈한 조건, 맨 바깥에서 밟은
 *        줄, 출력 목록, 지금 밟은 자리(`cursor`).
 * 이번 걸음 — `step`. 흐름이 어디서 왔는지(`from`)를 실어 그림이 운동을 고른다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type RowRole = 'def' | 'body' | 'top';
export type Row = { indent: number; text: string; role: RowRole };
export type Val = number | string;
export type Cond = { line: number; l: Val; op: string; r: Val; value: boolean };

export type Frame = {
  /** 이 틀의 함수 */
  fn: string;
  /** 이 틀이 받은 값 — 매개변수 차례대로 */
  args: Val[];
  /** 이 틀을 세운 부르는 줄 */
  callLine: number;
  /** 이 틀 안에서 밟은 줄 (차례대로, 겹침 없이) */
  visited: number[];
  cond: Cond | null;
};

export type Cursor = { depth: number; line: number };

export type Step =
  | { kind: 'start' }
  | { kind: 'call'; depth: number; line: number; from: number | null; self: boolean }
  | { kind: 'enter'; depth: number; line: number; again: boolean }
  | { kind: 'line'; depth: number; line: number; from: number | null; showed: boolean };

export type RecursionSelfCallScene = {
  rows: Row[];
  fn: string;
  params: string[];
  maxDepth: number;
  frames: Frame[];
  topVisited: number[];
  output: string[];
  cursor: Cursor | null;
  step: Step;
};

function empty(): RecursionSelfCallScene {
  return {
    rows: [],
    fn: '',
    params: [],
    maxDepth: 0,
    frames: [],
    topVisited: [],
    output: [],
    cursor: null,
    step: { kind: 'start' },
  };
}

function rec(p: unknown): Record<string, unknown> {
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
}

function isVal(v: unknown): v is Val {
  return typeof v === 'number' || typeof v === 'string';
}

function readRows(v: unknown): Row[] {
  if (!Array.isArray(v)) return [];
  const out: Row[] = [];
  for (const item of v) {
    const r = rec(item);
    const role = r.role === 'def' || r.role === 'body' || r.role === 'top' ? r.role : null;
    if (typeof r.indent === 'number' && typeof r.text === 'string' && role) {
      out.push({ indent: r.indent, text: r.text, role });
    }
  }
  return out;
}

function withLine(list: number[], line: number): number[] {
  return list.includes(line) ? [...list] : [...list, line];
}

/** 같은 깊이에서 바로 앞에 밟은 줄 — 흐름이 거기서 왔다 */
function fromOf(scene: RecursionSelfCallScene, depth: number): number | null {
  return scene.cursor && scene.cursor.depth === depth ? scene.cursor.line : null;
}

function copyFrames(frames: Frame[]): Frame[] {
  return frames.map((f) => ({ ...f, args: [...f.args], visited: [...f.visited] }));
}

export const recursionSelfCallScene: ScenePlan<RecursionSelfCallScene> = {
  initial: () => empty(),

  reduce(scene, event: FacetRuntimeEvent) {
    const p = rec(event.payload);

    if (event.type === 'init') {
      const params = Array.isArray(p.params) ? p.params.filter((x): x is string => typeof x === 'string') : [];
      return {
        ...empty(),
        rows: readRows(p.rows),
        fn: typeof p.fn === 'string' ? p.fn : '',
        params,
        maxDepth: typeof p.maxDepth === 'number' ? p.maxDepth : 0,
      };
    }

    if (event.type === 'call') {
      if (typeof p.line !== 'number' || typeof p.depth !== 'number') return scene;
      const line = p.line;
      const depth = p.depth;
      const args = Array.isArray(p.args) ? p.args.filter(isVal) : [];
      const frames = copyFrames(scene.frames);
      let topVisited = [...scene.topVisited];
      if (depth === 0) topVisited = withLine(topVisited, line);
      else if (frames[depth - 1]) frames[depth - 1] = { ...frames[depth - 1]!, visited: withLine(frames[depth - 1]!.visited, line) };
      frames.push({ fn: typeof p.fn === 'string' ? p.fn : '', args, callLine: line, visited: [], cond: null });
      return {
        ...scene,
        frames,
        topVisited,
        output: [...scene.output],
        cursor: { depth, line },
        step: { kind: 'call', depth, line, from: fromOf(scene, depth), self: p.self === true },
      };
    }

    if (event.type === 'line') {
      if (typeof p.line !== 'number' || typeof p.depth !== 'number') return scene;
      const line = p.line;
      const depth = p.depth;
      const c = rec(p.cond);
      const cond: Cond | null =
        isVal(c.l) && isVal(c.r) && typeof c.op === 'string' && typeof c.value === 'boolean'
          ? { line, l: c.l, op: c.op, r: c.r, value: c.value }
          : null;
      const out = typeof p.out === 'string' ? p.out : null;
      const showed = out !== null;
      const output = out !== null ? [...scene.output, out] : [...scene.output];
      const frames = copyFrames(scene.frames);
      let topVisited = [...scene.topVisited];
      let step: Step;
      if (depth === 0) {
        topVisited = withLine(topVisited, line);
        step = { kind: 'line', depth, line, from: fromOf(scene, depth), showed };
      } else {
        const f = frames[depth - 1];
        if (!f) return scene;
        const entering = f.visited.length === 0;
        frames[depth - 1] = { ...f, visited: withLine(f.visited, line), cond: cond ?? f.cond };
        step = entering
          ? { kind: 'enter', depth, line, again: frames.slice(0, depth - 1).some((g) => g.fn === f.fn) }
          : { kind: 'line', depth, line, from: fromOf(scene, depth), showed };
      }
      return { ...scene, frames, topVisited, output, cursor: { depth, line }, step };
    }

    return scene;
  },
};
