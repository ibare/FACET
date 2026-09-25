/**
 * double-free 의 장면 — 알고리즘이 실어 보낸 모습을 잇는다. 할당기를 다시 돌리지 않는다.
 *
 * 바탕 : code · slots · heapBase (init 이 한 번 정한다)
 * 자취 : vals · cells · freelist · landEnd · out (걸음마다 알고리즘이 보낸 모습)
 * 이번 걸음 : step — 무엇이 일어났는지와 운동의 계기값(from · landBefore · was)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SlotVal = number | 'null' | null;

export type HeapCell = { addr: number; value: SlotVal; holders: string[] };

export type DoubleFreeStep =
  | { kind: 'start' }
  | {
      kind: 'alloc';
      line: number;
      from: number;
      name: string;
      addr: number;
      source: 'land' | 'list';
      landBefore: number;
    }
  | { kind: 'free'; line: number; from: number; name: string; addr: number }
  | {
      kind: 'store';
      line: number;
      from: number;
      name: string;
      addr: number;
      value: number | 'null';
      was: SlotVal;
    }
  | {
      kind: 'show';
      line: number;
      from: number;
      name: string;
      addr: number;
      value: number | 'null';
      mine: SlotVal;
    };

export type DoubleFreeScene = {
  code: { indent: number; text: string }[];
  slots: { name: string; addr: number }[];
  heapBase: number;
  vals: SlotVal[];
  cells: HeapCell[];
  freelist: number[];
  landEnd: number;
  out: (number | 'null')[];
  step: DoubleFreeStep | null;
};

function rec(x: unknown): Record<string, unknown> {
  return typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {};
}

function num(x: unknown, fallback = 0): number {
  return typeof x === 'number' ? x : fallback;
}

function str(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

function list(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function val(x: unknown): SlotVal {
  if (typeof x === 'number') return x;
  if (x === 'null') return 'null';
  return null;
}

function filled(x: unknown): number | 'null' {
  return typeof x === 'number' ? x : 'null';
}

/** 걸음마다 오는 모습 — 자취 전부를 새 배열로 */
function readSnap(p: Record<string, unknown>) {
  return {
    vals: list(p.vals).map(val),
    cells: list(p.cells).map((c) => {
      const r = rec(c);
      return { addr: num(r.addr), value: val(r.value), holders: list(r.holders).map(str) };
    }),
    freelist: list(p.freelist).map((a) => num(a)),
    landEnd: num(p.landEnd),
    out: list(p.out).map(filled),
  };
}

export const doubleFreeScene: ScenePlan<DoubleFreeScene> = {
  initial(): DoubleFreeScene {
    return {
      code: [],
      slots: [],
      heapBase: 0,
      vals: [],
      cells: [],
      freelist: [],
      landEnd: 0,
      out: [],
      step: null,
    };
  },

  reduce(scene: DoubleFreeScene, event: FacetRuntimeEvent): DoubleFreeScene {
    const p = rec(event.payload);
    if (event.type === 'init') {
      const heapBase = num(p.heapBase);
      return {
        code: list(p.code).map((l) => {
          const r = rec(l);
          return { indent: num(r.indent), text: str(r.text) };
        }),
        slots: list(p.slots).map((s) => {
          const r = rec(s);
          return { name: str(r.name), addr: num(r.addr) };
        }),
        heapBase,
        ...readSnap({ landEnd: heapBase, ...p }),
        step: { kind: 'start' },
      };
    }
    const line = num(p.line);
    const from = num(p.from, -1);
    const name = str(p.name);
    const addr = num(p.addr);
    let step: DoubleFreeStep;
    if (event.type === 'alloc') {
      step = {
        kind: 'alloc',
        line,
        from,
        name,
        addr,
        source: p.source === 'land' ? 'land' : 'list',
        landBefore: num(p.landBefore),
      };
    } else if (event.type === 'free') {
      step = { kind: 'free', line, from, name, addr };
    } else if (event.type === 'store') {
      step = { kind: 'store', line, from, name, addr, value: filled(p.value), was: val(p.was) };
    } else if (event.type === 'show') {
      step = { kind: 'show', line, from, name, addr, value: filled(p.value), mine: val(p.mine) };
    } else {
      throw new Error(`double-free 장면: 모르는 이벤트 ${event.type}`);
    }
    return { ...scene, ...readSnap(p), step };
  },
};
