/**
 * 장면 — 틀(클래스) 하나와 거기서 찍혀 나온 객체들, 그리고 출력.
 *
 * 바탕: 줄 · 클래스 · 객체 수 (init 이 한 번 정한다)
 * 자취: 찍힌 객체와 그 칸의 값 · 가리키는 이름 · 출력
 * 이번 걸음: 밟은 줄 · 몸 안에서 밟은 줄 · 찍힌 객체 · 바뀐 칸 · 이번 출력
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneVal = number | string | boolean | null;

export type SceneObject = {
  cls: string;
  names: string[];
  cells: { field: string; value: SceneVal }[];
};

export type SceneChange = { obj: number; field: string; from: SceneVal; to: SceneVal };
export type SceneShown = { value: SceneVal; src: { obj: number; field: string } | null };

export type InstantiateStep =
  | { kind: 'start' }
  | {
      kind: 'line';
      line: number;
      inner: number[];
      stamped: number[];
      changed: SceneChange[];
      shown: SceneShown[];
    };

export type InstantiateScene = {
  lines: { indent: number; text: string }[];
  classes: { name: string; fields: string[] }[];
  objectCount: number;
  objects: SceneObject[];
  outputs: SceneVal[];
  step: InstantiateStep;
};

function emptyScene(): InstantiateScene {
  return { lines: [], classes: [], objectCount: 0, objects: [], outputs: [], step: { kind: 'start' } };
}

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function isVal(v: unknown): v is SceneVal {
  return v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean';
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function numbers(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}

function readInit(payload: unknown): InstantiateScene {
  const p = rec(payload);
  const scene = emptyScene();
  if (p === null) return scene;
  if (Array.isArray(p.lines)) {
    for (const raw of p.lines) {
      const ln = rec(raw);
      if (ln !== null && typeof ln.indent === 'number' && typeof ln.text === 'string') {
        scene.lines.push({ indent: ln.indent, text: ln.text });
      }
    }
  }
  if (Array.isArray(p.classes)) {
    for (const raw of p.classes) {
      const c = rec(raw);
      if (c !== null && typeof c.name === 'string') scene.classes.push({ name: c.name, fields: strings(c.fields) });
    }
  }
  if (typeof p.objectCount === 'number') scene.objectCount = p.objectCount;
  return scene;
}

function applyLine(scene: InstantiateScene, payload: unknown): InstantiateScene {
  const p = rec(payload);
  if (p === null || typeof p.line !== 'number') return scene;
  const objects = scene.objects.map((o) => ({ cls: o.cls, names: [...o.names], cells: o.cells.map((c) => ({ ...c })) }));
  const outputs = [...scene.outputs];
  const stamped: number[] = [];
  const changed: SceneChange[] = [];
  const shown: SceneShown[] = [];
  const fx = Array.isArray(p.fx) ? p.fx : [];
  for (const raw of fx) {
    const f = rec(raw);
    if (f === null) continue;
    if (f.k === 'new' && typeof f.obj === 'number' && typeof f.cls === 'string') {
      objects[f.obj] = { cls: f.cls, names: [], cells: strings(f.fields).map((field) => ({ field, value: null })) };
      stamped.push(f.obj);
    } else if (f.k === 'set' && typeof f.obj === 'number' && typeof f.field === 'string' && isVal(f.from) && isVal(f.to)) {
      const o = objects[f.obj];
      const cell = o?.cells.find((c) => c.field === f.field);
      if (cell !== undefined) cell.value = f.to;
      changed.push({ obj: f.obj, field: f.field, from: f.from, to: f.to });
    } else if (f.k === 'bind' && typeof f.name === 'string' && typeof f.obj === 'number') {
      for (const o of objects) o.names = o.names.filter((n) => n !== f.name);
      objects[f.obj]?.names.push(f.name);
    } else if (f.k === 'show' && isVal(f.value)) {
      const s = rec(f.src);
      const src = s !== null && typeof s.obj === 'number' && typeof s.field === 'string' ? { obj: s.obj, field: s.field } : null;
      outputs.push(f.value);
      shown.push({ value: f.value, src });
    }
  }
  return {
    lines: scene.lines,
    classes: scene.classes,
    objectCount: scene.objectCount,
    objects,
    outputs,
    step: { kind: 'line', line: p.line, inner: numbers(p.inner), stamped, changed, shown },
  };
}

export const instantiateFromClassScene: ScenePlan<InstantiateScene> = {
  /** 줄 글자만 베껴 첫 그림에 프로그램을 세운다. 틀 · 객체 수는 init 이 채운다. */
  initial(initialData: unknown): InstantiateScene {
    const d = rec(initialData);
    return readInit({ lines: d?.lines });
  },
  reduce(scene: InstantiateScene, event: FacetRuntimeEvent): InstantiateScene {
    if (event.type === 'init') return readInit(event.payload);
    if (event.type === 'line') return applyLine(scene, event.payload);
    return scene;
  },
};
