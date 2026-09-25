/**
 * method-lookup-up 장면 — 이벤트를 잇기만 한다. 해석(찾기 · 몸 돌리기)은 알고리즘이 했다.
 *
 * - 바탕: `base` — 줄 글자와 클래스 구조 (init 이 한 번 정한다)
 * - 자취: `objects` · `counts` · `ran` · `outputs` · `call`(지금 부름에서 들여다본 차례)
 * - 이번 걸음: `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneLine = { indent: number; text: string };
export type SceneClass = {
  name: string;
  parent: string | null;
  first: number;
  last: number;
  methods: { name: string; line: number }[];
};
export type SceneBase = { lines: SceneLine[]; classes: SceneClass[] };

export type Looked = { cls: string; found: boolean; methodLine: number };
export type SceneCall = {
  line: number;
  method: string;
  looked: Looked[];
  shadowed: { cls: string; line: number }[];
};

export type SceneStep =
  | { kind: 'start' }
  | { kind: 'create'; line: number; name: string; cls: string }
  | {
      kind: 'look';
      method: string;
      cls: string;
      found: boolean;
      n: number;
      from: string | null;
    }
  | { kind: 'run'; line: number; cls: string; method: string; output: string };

export type MethodLookupUpScene = {
  base: SceneBase | null;
  objects: { line: number; name: string; cls: string }[];
  call: SceneCall | null;
  counts: { line: number; n: number }[];
  ran: number[];
  outputs: string[];
  step: SceneStep | null;
};

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function readBase(p: Record<string, unknown>): SceneBase {
  const lines: SceneLine[] = [];
  for (const raw of arr(p.lines)) {
    const r = rec(raw);
    const indent = num(r?.indent);
    const text = str(r?.text);
    if (indent !== null && text !== null) lines.push({ indent, text });
  }
  const classes: SceneClass[] = [];
  for (const raw of arr(p.classes)) {
    const r = rec(raw);
    const name = str(r?.name);
    const first = num(r?.first);
    const last = num(r?.last);
    if (name === null || first === null || last === null) continue;
    const methods: { name: string; line: number }[] = [];
    for (const m of arr(r?.methods)) {
      const mr = rec(m);
      const mn = str(mr?.name);
      const ml = num(mr?.line);
      if (mn !== null && ml !== null) methods.push({ name: mn, line: ml });
    }
    classes.push({ name, parent: str(r?.parent), first, last, methods });
  }
  return { lines, classes };
}

export const methodLookupUpScene: ScenePlan<MethodLookupUpScene> = {
  initial(): MethodLookupUpScene {
    return {
      base: null,
      objects: [],
      call: null,
      counts: [],
      ran: [],
      outputs: [],
      step: null,
    };
  },

  reduce(scene: MethodLookupUpScene, event: FacetRuntimeEvent): MethodLookupUpScene {
    const p = rec(event.payload);
    if (!p) return scene;

    if (event.type === 'init') {
      return {
        base: readBase(p),
        objects: [],
        call: null,
        counts: [],
        ran: [],
        outputs: [],
        step: { kind: 'start' },
      };
    }

    if (event.type === 'create') {
      const line = num(p.line);
      const name = str(p.name);
      const cls = str(p.cls);
      if (line === null || name === null || cls === null) return scene;
      return {
        ...scene,
        objects: [...scene.objects, { line, name, cls }],
        call: null,
        step: { kind: 'create', line, name, cls },
      };
    }

    if (event.type === 'look') {
      const line = num(p.line);
      const method = str(p.method);
      const cls = str(p.cls);
      const depth = num(p.depth);
      const methodLine = num(p.methodLine);
      const found = p.found === true;
      if (line === null || method === null || cls === null || depth === null) return scene;
      const shadowed: { cls: string; line: number }[] = [];
      for (const raw of arr(p.shadowed)) {
        const r = rec(raw);
        const sc = str(r?.cls);
        const sl = num(r?.line);
        if (sc !== null && sl !== null) shadowed.push({ cls: sc, line: sl });
      }
      const fresh = depth === 0 || scene.call === null;
      const before = fresh ? [] : scene.call?.looked ?? [];
      const looked = [...before, { cls, found, methodLine: methodLine ?? -1 }];
      const counts = fresh
        ? [...scene.counts, { line, n: looked.length }]
        : scene.counts.map((c, i) =>
            i === scene.counts.length - 1 ? { line: c.line, n: looked.length } : c,
          );
      return {
        ...scene,
        call: { line, method, looked, shadowed: found ? shadowed : [] },
        counts,
        step: {
          kind: 'look',
          method,
          cls,
          found,
          n: looked.length,
          from: fresh ? null : str(p.from),
        },
      };
    }

    if (event.type === 'run') {
      const line = num(p.line);
      const cls = str(p.cls);
      const method = str(p.method);
      const output = str(p.output);
      if (line === null || cls === null || method === null || output === null) return scene;
      return {
        ...scene,
        ran: [...scene.ran, line],
        outputs: [...scene.outputs, output],
        step: { kind: 'run', line, cls, method, output },
      };
    }

    return scene;
  },
};
