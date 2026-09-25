/**
 * return-to-caller 장면 — 이벤트를 잇기만 한다. 해석은 알고리즘이 했다.
 *
 * 바탕: `calls` (init 이 한 번 정한다)
 * 자취: `lines` (돌아옴이 부른 줄의 글자를 갈아 끼운다) · `vars` · `out`
 * 살아 있는 것: `frames` (부름 ~ 돌아옴 사이의 틀) · `ret` (돌려줄 값이 몸 밖에 나와 있다)
 * 이번 걸음: `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type RtcSeg =
  | { kind: 'text'; text: string }
  | { kind: 'call'; cid: number; text: string }
  | { kind: 'value'; cid: number; call: string; value: string };

export type RtcLine = { indent: number; segs: RtcSeg[] };
export type RtcArg = { param: string; value: string };
export type RtcFrame = { cid: number; header: number; line: number; args: RtcArg[] };

export type RtcStep =
  | { kind: 'start' }
  | { kind: 'call'; line: number; cid: number; header: number }
  | { kind: 'return'; line: number; cid: number; value: string; expr: string }
  | { kind: 'arrive'; line: number; cid: number; value: string; from: number; before: RtcSeg[] }
  | { kind: 'assign'; line: number; name: string; value: string; expr: string }
  | { kind: 'show'; line: number; value: string; expr: string };

export type ReturnToCallerScene = {
  calls: number;
  lines: RtcLine[];
  vars: { name: string; value: string; line: number }[];
  out: string[];
  frames: RtcFrame[];
  ret: { line: number; cid: number; value: string } | null;
  /** 지금 밟은 줄. 시작에는 없다. */
  at: number | null;
  step: RtcStep;
};

function num(v: unknown, fallback = -1): number {
  return typeof v === 'number' ? v : fallback;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function readSegs(v: unknown): RtcSeg[] {
  if (!Array.isArray(v)) return [];
  const out: RtcSeg[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const s = raw as { kind?: unknown; text?: unknown; cid?: unknown; call?: unknown; value?: unknown };
    if (s.kind === 'text') out.push({ kind: 'text', text: str(s.text) });
    else if (s.kind === 'call') out.push({ kind: 'call', cid: num(s.cid), text: str(s.text) });
    else if (s.kind === 'value') out.push({ kind: 'value', cid: num(s.cid), call: str(s.call), value: str(s.value) });
  }
  return out;
}

function readLines(v: unknown): RtcLine[] {
  if (!Array.isArray(v)) return [];
  const out: RtcLine[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const l = raw as { indent?: unknown; segs?: unknown };
    out.push({ indent: num(l.indent, 0), segs: readSegs(l.segs) });
  }
  return out;
}

function readArgs(v: unknown): RtcArg[] {
  if (!Array.isArray(v)) return [];
  const out: RtcArg[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const a = raw as { param?: unknown; value?: unknown };
    out.push({ param: str(a.param), value: str(a.value) });
  }
  return out;
}

function empty(): ReturnToCallerScene {
  return { calls: 0, lines: [], vars: [], out: [], frames: [], ret: null, at: null, step: { kind: 'start' } };
}

export const returnToCallerScene: ScenePlan<ReturnToCallerScene> = {
  initial(): ReturnToCallerScene {
    return empty();
  },

  reduce(scene: ReturnToCallerScene, event: FacetRuntimeEvent): ReturnToCallerScene {
    const p = (typeof event.payload === 'object' && event.payload !== null ? event.payload : {}) as Record<string, unknown>;
    switch (event.type) {
      case 'init':
        return { ...empty(), calls: num(p.calls, 0), lines: readLines(p.lines) };
      case 'call': {
        const line = num(p.line);
        const cid = num(p.cid);
        const header = num(p.header);
        return {
          ...scene,
          frames: [...scene.frames, { cid, header, line, args: readArgs(p.args) }],
          at: line,
          step: { kind: 'call', line, cid, header },
        };
      }
      case 'return': {
        const line = num(p.line);
        const cid = num(p.cid);
        const value = str(p.value);
        return {
          ...scene,
          ret: { line, cid, value },
          at: line,
          step: { kind: 'return', line, cid, value, expr: str(p.expr) },
        };
      }
      case 'arrive': {
        const line = num(p.line);
        const cid = num(p.cid);
        const before = scene.lines[line]?.segs ?? [];
        const lines = scene.lines.map((l, i) => (i === line ? { indent: l.indent, segs: readSegs(p.segs) } : l));
        return {
          ...scene,
          lines,
          frames: scene.frames.filter((f) => f.cid !== cid),
          ret: null,
          at: line,
          step: { kind: 'arrive', line, cid, value: str(p.value), from: num(p.from), before },
        };
      }
      case 'assign': {
        const line = num(p.line);
        const name = str(p.name);
        const value = str(p.value);
        const vars = scene.vars.filter((v) => v.name !== name);
        return {
          ...scene,
          vars: [...vars, { name, value, line }],
          at: line,
          step: { kind: 'assign', line, name, value, expr: str(p.expr) },
        };
      }
      case 'show': {
        const line = num(p.line);
        const value = str(p.value);
        return {
          ...scene,
          out: [...scene.out, value],
          at: line,
          step: { kind: 'show', line, value, expr: str(p.expr) },
        };
      }
      default:
        return scene;
    }
  },
};
