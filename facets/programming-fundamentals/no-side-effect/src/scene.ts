/**
 * no-side-effect 의 장면.
 *
 * 바탕 — 줄 목록과 함수 몸의 범위 (init 이 한 번 정한다)
 * 자취 — 바깥 이름의 지금 값 · 몸에서 바깥으로 뻗은 쓰기들 · 부르기마다 바깥 전/뒤 · 출력들
 * 이번 걸음 — 밟은 줄과 그 줄에서 일어난 일
 *
 * 좌표 · 문안 · DOM 은 담지 않는다. 셈은 알고리즘이 했고, 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneLine = { indent: number; text: string };
export type SceneFunction = { name: string; header: number; last: number };
export type NamedValue = { name: string; value: number };
export type SceneWrite = { line: number; name: string; before: number; after: number; callLine: number };
export type SceneCall = {
  line: number;
  fn: string;
  args: number[];
  header: number;
  returnLine: number;
  value: number;
  before: NamedValue[];
  after: NamedValue[];
};
export type SceneOutput = { line: number; value: number };

export type SceneStep =
  | { kind: 'start' }
  | { kind: 'declare'; line: number; name: string; value: number }
  | { kind: 'call'; line: number; call: SceneCall; writes: SceneWrite[] }
  | { kind: 'show'; line: number; value: number; readOuter: string | null };

export type NoSideEffectScene = {
  lines: SceneLine[];
  functions: SceneFunction[];
  /** 바깥 이름 — 선언된 차례대로. 선언 줄과 지금 값. */
  outer: { name: string; line: number; value: number }[];
  writes: SceneWrite[];
  calls: SceneCall[];
  outputs: SceneOutput[];
  step: SceneStep;
};

const EMPTY: NoSideEffectScene = {
  lines: [],
  functions: [],
  outer: [],
  writes: [],
  calls: [],
  outputs: [],
  step: { kind: 'start' },
};

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function named(v: unknown): NamedValue[] {
  const out: NamedValue[] = [];
  for (const item of list(v)) {
    const o = rec(item);
    const name = str(o?.name);
    const value = num(o?.value);
    if (name !== null && value !== null) out.push({ name, value });
  }
  return out;
}

function reduceInit(payload: unknown): NoSideEffectScene {
  const p = rec(payload);
  const lines: SceneLine[] = [];
  for (const item of list(p?.lines)) {
    const o = rec(item);
    const indent = num(o?.indent);
    const text = str(o?.text);
    if (indent !== null && text !== null) lines.push({ indent, text });
  }
  const functions: SceneFunction[] = [];
  for (const item of list(p?.functions)) {
    const o = rec(item);
    const name = str(o?.name);
    const header = num(o?.header);
    const last = num(o?.last);
    if (name !== null && header !== null && last !== null) functions.push({ name, header, last });
  }
  return { ...EMPTY, lines, functions };
}

function reduceStep(scene: NoSideEffectScene, payload: unknown): NoSideEffectScene {
  const p = rec(payload);
  const line = num(p?.line);
  if (line === null) return scene;

  const after = named(p?.outerAfter);
  const before = named(p?.outerBefore);
  const outer = after.map((o) => {
    const had = scene.outer.find((x) => x.name === o.name);
    return { name: o.name, line: had ? had.line : line, value: o.value };
  });

  const shown = num(p?.shown);
  const outputs = shown === null ? scene.outputs : [...scene.outputs, { line, value: shown }];

  const d = rec(p?.declared);
  const dName = str(d?.name);
  const dValue = num(d?.value);

  const c = rec(p?.call);
  const fn = str(c?.fn);
  const header = num(c?.header);
  const returnLine = num(c?.returnLine);
  const value = num(c?.value);

  if (fn !== null && header !== null && returnLine !== null && value !== null) {
    const args: number[] = [];
    for (const a of list(c?.args)) {
      const n = num(a);
      if (n !== null) args.push(n);
    }
    const writes: SceneWrite[] = [];
    for (const item of list(p?.writes)) {
      const w = rec(item);
      const wLine = num(w?.line);
      const wName = str(w?.name);
      const wBefore = num(w?.before);
      const wAfter = num(w?.after);
      if (wLine !== null && wName !== null && wBefore !== null && wAfter !== null) {
        writes.push({ line: wLine, name: wName, before: wBefore, after: wAfter, callLine: line });
      }
    }
    const call: SceneCall = { line, fn, args, header, returnLine, value, before, after };
    return {
      ...scene,
      outer,
      outputs,
      writes: [...scene.writes, ...writes],
      calls: [...scene.calls, call],
      step: { kind: 'call', line, call, writes },
    };
  }

  if (dName !== null && dValue !== null) {
    return { ...scene, outer, outputs, step: { kind: 'declare', line, name: dName, value: dValue } };
  }

  if (shown !== null) {
    const readOuter = str(p?.readOuter);
    return { ...scene, outer, outputs, step: { kind: 'show', line, value: shown, readOuter } };
  }

  return { ...scene, outer, outputs };
}

export const noSideEffectScene: ScenePlan<NoSideEffectScene> = {
  initial(): NoSideEffectScene {
    return EMPTY;
  },
  reduce(scene: NoSideEffectScene, event: FacetRuntimeEvent): NoSideEffectScene {
    if (event.type === 'init') return reduceInit(event.payload);
    if (event.type === 'step') return reduceStep(scene, event.payload);
    return scene;
  },
};
