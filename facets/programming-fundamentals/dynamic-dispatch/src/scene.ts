/**
 * 동적 디스패치의 장면.
 *
 * - 바탕 — 줄 목록과 클래스 몸의 자리 (`initial` 이 `initialData` 에서 베껴 세운다)
 * - 자취 — 목록에 선 객체들, 부르는 줄에서 갈라져 나간 가지들, 보인 값들
 * - 이번 걸음 — `step`
 *
 * 셈은 알고리즘이 했다. 장면은 이벤트를 이어 붙이기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { classSpans, type ShapeLine } from './algorithm.js';

export type DdLine = { indent: number; text: string };
export type DdClass = {
  name: string;
  parent: string | null;
  from: number;
  to: number;
  methods: { name: string; line: number }[];
};
export type DdObject = { obj: number; cls: string; from: number; to: number };
/** 부르는 줄에서 한 번 갈라져 나간 가지. */
export type DdBranch = {
  line: number;
  /** 받는 쪽 식의 글자 (`item`). */
  recv: string;
  obj: number;
  cls: string;
  method: string;
  owner: string;
  body: number;
  ret: number | null;
  value: string | null;
  back: boolean;
};

export type DdStep =
  | { kind: 'start' }
  | { kind: 'build'; line: number }
  /** `from` — 이 부름 앞에 item 이 가리키던 객체 (처음이면 null). */
  | { kind: 'call'; branch: number; from: number | null }
  | { kind: 'return'; branch: number }
  /** `same` — 보인 줄이 그 가지가 나간 부르는 줄과 같은가 (장면이 줄 번호를 견준 결과). */
  | { kind: 'show'; branch: number; out: number; same: boolean };

export type DdTally = { calls: number; bodies: number; never: string[] };

export type DynamicDispatchScene = {
  lines: DdLine[];
  classes: DdClass[];
  listLine: number | null;
  listName: string | null;
  objects: DdObject[];
  item: number | null;
  branches: DdBranch[];
  outputs: string[];
  step: DdStep;
  tally: DdTally | null;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** `initialData.lines` 를 좁혀 베낀다 — 글자와 모양만. */
function readProgram(v: unknown): { lines: DdLine[]; classes: DdClass[] } {
  const src = rec(v)?.lines;
  if (!Array.isArray(src)) return { lines: [], classes: [] };
  const lines: DdLine[] = [];
  const shapes: ShapeLine[] = [];
  for (const x of src) {
    const r = rec(x);
    const indent = num(r?.indent);
    const text = str(r?.text);
    const st = rec(r?.stmt);
    const k = str(st?.k);
    if (indent === null || text === null || k === null) {
      throw new Error(`dynamic-dispatch: 줄 ${lines.length + 1} 의 모양이 어긋난다 (indent · text · stmt.k)`);
    }
    lines.push({ indent, text });
    shapes.push({ indent, stmt: { k, name: str(st?.name) ?? undefined, extends: str(st?.extends) ?? undefined } });
  }
  return { lines, classes: classSpans(shapes) };
}

function readObjects(v: unknown): DdObject[] {
  if (!Array.isArray(v)) return [];
  const out: DdObject[] = [];
  for (const x of v) {
    const r = rec(x);
    const obj = num(r?.obj);
    const cls = str(r?.cls);
    const from = num(r?.from);
    const to = num(r?.to);
    if (obj !== null && cls !== null && from !== null && to !== null) out.push({ obj, cls, from, to });
  }
  return out;
}

/** 끝난 뒤의 셈 — 부르는 줄 수, 간 몸 수, 같은 이름의 몸 가운데 한 번도 안 간 것. */
function tallyOf(scene: DynamicDispatchScene): DdTally {
  const callLines = new Set(scene.branches.map((b) => b.line));
  const bodies = new Set(scene.branches.map((b) => b.body));
  const names = new Set(scene.branches.map((b) => b.method));
  const never: string[] = [];
  for (const c of scene.classes) {
    for (const m of c.methods) {
      if (names.has(m.name) && !bodies.has(m.line)) never.push(`${c.name}.${m.name}`);
    }
  }
  return { calls: callLines.size, bodies: bodies.size, never };
}

function empty(): DynamicDispatchScene {
  return {
    lines: [],
    classes: [],
    listLine: null,
    listName: null,
    objects: [],
    item: null,
    branches: [],
    outputs: [],
    step: { kind: 'start' },
    tally: null,
  };
}

export const dynamicDispatchScene: ScenePlan<DynamicDispatchScene> = {
  initial(initialData: unknown): DynamicDispatchScene {
    return { ...empty(), ...readProgram(initialData) };
  },

  reduce(scene: DynamicDispatchScene, event: FacetRuntimeEvent): DynamicDispatchScene {
    const p = rec(event.payload);
    switch (event.type) {
      case 'build': {
        const line = num(p?.line);
        if (line === null) return scene;
        return {
          ...scene,
          listLine: line,
          listName: str(p?.name),
          objects: readObjects(p?.items),
          step: { kind: 'build', line },
        };
      }
      case 'call': {
        const line = num(p?.line);
        const obj = num(p?.obj);
        const body = num(p?.body);
        const cls = str(p?.cls);
        const method = str(p?.method);
        const owner = str(p?.owner);
        const recv = str(p?.recv) ?? '';
        if (line === null || obj === null || body === null || cls === null || method === null || owner === null) {
          return scene;
        }
        const branch: DdBranch = { line, recv, obj, cls, method, owner, body, ret: null, value: null, back: false };
        return {
          ...scene,
          item: obj,
          branches: [...scene.branches, branch],
          step: { kind: 'call', branch: scene.branches.length, from: scene.item },
        };
      }
      case 'return': {
        const line = num(p?.line);
        const value = str(p?.value);
        const at = scene.branches.length - 1;
        if (line === null || value === null || at < 0) return scene;
        const branches = scene.branches.map((b, i) => (i === at ? { ...b, ret: line, value } : b));
        return { ...scene, branches, step: { kind: 'return', branch: at } };
      }
      case 'show': {
        const shown = str(p?.shown);
        const line = num(p?.line);
        const at = scene.branches.length - 1;
        if (shown === null || line === null || at < 0) return scene;
        const branches = scene.branches.map((b, i) => (i === at ? { ...b, back: true } : b));
        return {
          ...scene,
          branches,
          outputs: [...scene.outputs, shown],
          step: { kind: 'show', branch: at, out: scene.outputs.length, same: line === scene.branches[at].line },
        };
      }
      case 'done': {
        const next = { ...scene };
        return { ...next, tally: tallyOf(next) };
      }
      default:
        return scene;
    }
  },
};
