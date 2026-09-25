/**
 * 참조 타입 장면 — 이벤트를 잇기만 한다. 해석은 알고리즘이 했다.
 *
 * 바탕: lines · listCount · widest (init 이 한 번 정한다)
 * 자취: lists (놓인 목록, 놓인 차례) · slots (이름의 자리와 그 안의 주소)
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneLine = { indent: number; text: string };
export type PlacedList = { addr: number; items: (number | string)[] };
export type SceneSlot = { name: string; addr: number; holds: number };

export type ReferenceStep =
  | { kind: 'start' }
  | {
      kind: 'place';
      line: number;
      name: string;
      list: number;
      count: number;
      /** 이 걸음 전에 자리 안에 있던 주소. 새 자리면 null. */
      was: number | null;
      declare: boolean;
    };

export type ReferenceHoldsAddressScene = {
  lines: SceneLine[];
  listCount: number;
  /** 바탕에서 가장 긴 목록의 원소 수. */
  widest: number;
  lists: PlacedList[];
  slots: SceneSlot[];
  step: ReferenceStep | null;
};

function empty(): ReferenceHoldsAddressScene {
  return { lines: [], listCount: 0, widest: 0, lists: [], slots: [], step: null };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readLines(v: unknown): SceneLine[] {
  if (!Array.isArray(v)) return [];
  const out: SceneLine[] = [];
  for (const l of v) {
    if (isRecord(l) && typeof l.indent === 'number' && typeof l.text === 'string') {
      out.push({ indent: l.indent, text: l.text });
    }
  }
  return out;
}

function readItems(v: unknown): (number | string)[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is number | string => typeof x === 'number' || typeof x === 'string');
}

export const referenceHoldsAddressScene: ScenePlan<ReferenceHoldsAddressScene> = {
  initial() {
    return empty();
  },
  reduce(scene, event: FacetRuntimeEvent) {
    const p = event.payload;
    if (event.type === 'init' && isRecord(p)) {
      return {
        lines: readLines(p.lines),
        listCount: typeof p.listCount === 'number' ? p.listCount : 0,
        widest: typeof p.widest === 'number' ? p.widest : 0,
        lists: [],
        slots: [],
        step: { kind: 'start' },
      };
    }
    if (event.type === 'place' && isRecord(p)) {
      if (
        typeof p.line !== 'number' ||
        typeof p.name !== 'string' ||
        typeof p.slot !== 'number' ||
        typeof p.list !== 'number'
      ) {
        return scene;
      }
      const name = p.name;
      const slotAddr = p.slot;
      const listAddr = p.list;
      const items = readItems(p.items);
      const was = typeof p.was === 'number' ? p.was : null;
      const has = scene.slots.some((s) => s.name === name);
      const slots = has
        ? scene.slots.map((s) => (s.name === name ? { ...s, holds: listAddr } : { ...s }))
        : [...scene.slots.map((s) => ({ ...s })), { name, addr: slotAddr, holds: listAddr }];
      return {
        lines: scene.lines,
        listCount: scene.listCount,
        widest: scene.widest,
        lists: [...scene.lists, { addr: listAddr, items }],
        slots,
        step: {
          kind: 'place',
          line: p.line,
          name,
          list: listAddr,
          count: items.length,
          was,
          declare: p.declare === true,
        },
      };
    }
    return scene;
  },
};
