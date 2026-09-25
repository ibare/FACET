/**
 * 값 전달과 참조 전달 — 장면.
 *
 * 바탕: 코드 줄(`lines`), 맨 바깥 자리의 수(`slots`).
 * 자취: 바깥 변수와 그 자리(`outer`), 자리마다 값(`values`), 지금 선 틀(`frames`), 걷힌 틀(`gone`),
 *       출력(`output`).
 * 이번 걸음: `step` — 종류와 인자, 그리고 운동의 출발값(`fromLine` · `was` · 걷힌 틀).
 *
 * 셈은 알고리즘이 했다. 여기서는 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { PassBind, Val } from './algorithm.js';

export type PassCodeLine = { indent: number; text: string };

export type PassOuterVar = { name: string; place: number };

export type PassFrame = { frame: number; fn: string; depth: number; binds: PassBind[] };

export type PassStep =
  | { kind: 'start' }
  | { kind: 'declare'; line: number; fromLine: number | null; name: string; place: number; value: Val }
  | { kind: 'call'; line: number; fromLine: number | null; frame: PassFrame }
  | { kind: 'assign'; line: number; fromLine: number | null; name: string; place: number; value: Val; was: Val }
  | { kind: 'return'; line: number; fromLine: number | null; frame: PassFrame; last: Record<number, Val> }
  | { kind: 'show'; line: number; fromLine: number | null; value: Val; from: number | null; slot: number };

export type PassScene = {
  lines: PassCodeLine[];
  slots: number;
  outer: PassOuterVar[];
  values: Record<number, Val>;
  frames: PassFrame[];
  gone: PassFrame[];
  output: Val[];
  step: PassStep | null;
};

function empty(): PassScene {
  return { lines: [], slots: 0, outer: [], values: {}, frames: [], gone: [], output: [], step: null };
}

function isVal(v: unknown): v is Val {
  return typeof v === 'number' || typeof v === 'string';
}

function num(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

function readBinds(v: unknown): PassBind[] {
  if (!Array.isArray(v)) return [];
  const out: PassBind[] = [];
  for (const b of v) {
    if (typeof b !== 'object' || b === null) continue;
    const r = b as Record<string, unknown>;
    const param = r.param;
    const arg = r.arg;
    const mode = r.mode;
    const place = r.place;
    const from = r.from;
    const value = r.value;
    if (typeof param !== 'string' || typeof arg !== 'string') continue;
    if (mode !== 'copy' && mode !== 'place') continue;
    if (typeof place !== 'number' || !isVal(value)) continue;
    out.push({ param, arg, mode, place, from: typeof from === 'number' ? from : null, value });
  }
  return out;
}

function lineOf(step: PassStep | null): number | null {
  return step && step.kind !== 'start' ? step.line : null;
}

export const passByValueVsReferenceScene: ScenePlan<PassScene> = {
  initial(): PassScene {
    return empty();
  },

  reduce(scene: PassScene, event: FacetRuntimeEvent): PassScene {
    const p = (typeof event.payload === 'object' && event.payload !== null
      ? event.payload
      : {}) as Record<string, unknown>;
    const fromLine = lineOf(scene.step);
    const line = num(p.line) ?? 0;

    if (event.type === 'init') {
      const raw = Array.isArray(p.lines) ? p.lines : [];
      const lines: PassCodeLine[] = [];
      for (const l of raw) {
        if (typeof l !== 'object' || l === null) continue;
        const r = l as Record<string, unknown>;
        if (typeof r.indent === 'number' && typeof r.text === 'string') {
          lines.push({ indent: r.indent, text: r.text });
        }
      }
      return { ...empty(), lines, slots: num(p.slots) ?? 0, step: { kind: 'start' } };
    }

    if (event.type === 'declare') {
      const name = typeof p.name === 'string' ? p.name : '';
      const place = num(p.place) ?? 0;
      const value = isVal(p.value) ? p.value : 0;
      const depth = num(p.depth) ?? 0;
      return {
        ...scene,
        outer: depth === 0 ? [...scene.outer, { name, place }] : scene.outer,
        values: { ...scene.values, [place]: value },
        step: { kind: 'declare', line, fromLine, name, place, value },
      };
    }

    if (event.type === 'call') {
      const frame: PassFrame = {
        frame: num(p.frame) ?? 0,
        fn: typeof p.fn === 'string' ? p.fn : '',
        depth: (num(p.depth) ?? 0) + 1,
        binds: readBinds(p.binds),
      };
      const values = { ...scene.values };
      for (const b of frame.binds) if (b.mode === 'copy') values[b.place] = b.value;
      return {
        ...scene,
        values,
        frames: [...scene.frames, frame],
        step: { kind: 'call', line, fromLine, frame },
      };
    }

    if (event.type === 'assign') {
      const name = typeof p.name === 'string' ? p.name : '';
      const place = num(p.place) ?? 0;
      const value = isVal(p.value) ? p.value : 0;
      const was = isVal(p.was) ? p.was : 0;
      return {
        ...scene,
        values: { ...scene.values, [place]: value },
        step: { kind: 'assign', line, fromLine, name, place, value, was },
      };
    }

    if (event.type === 'return') {
      const id = num(p.frame) ?? 0;
      const frame = scene.frames.find((f) => f.frame === id);
      if (!frame) return { ...scene, step: null };
      const values = { ...scene.values };
      const last: Record<number, Val> = {};
      for (const b of frame.binds) {
        const v = scene.values[b.place];
        if (v !== undefined) last[b.place] = v;
        if (b.mode === 'copy') delete values[b.place];
      }
      return {
        ...scene,
        values,
        frames: scene.frames.filter((f) => f.frame !== id),
        gone: [...scene.gone, frame],
        step: { kind: 'return', line, fromLine, frame, last },
      };
    }

    if (event.type === 'show') {
      const value = isVal(p.value) ? p.value : 0;
      const from = num(p.from);
      return {
        ...scene,
        output: [...scene.output, value],
        step: { kind: 'show', line, fromLine, value, from, slot: scene.output.length },
      };
    }

    return scene;
  },
};
