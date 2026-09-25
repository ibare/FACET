/**
 * aliasing 장면 — 이벤트를 잇기만 한다. 해석은 알고리즘이 이미 했다.
 *
 * 바탕: lines (start 가 한 번 정한다)
 * 자취: slots · lists · output · writes · reads (걸음이 쌓는다)
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneVal = { num: number } | { str: string } | { ref: number };

export type AliasingSlot = { name: string; addr: number; val: SceneVal };
export type AliasingList = { ref: number; items: SceneVal[] };
/** 목록 칸 하나를 어느 이름을 거쳐 건드렸는가 */
export type CellTouch = { via: string; ref: number; at: number };

export type AliasingStep =
  | { kind: 'start' }
  | { kind: 'assign'; line: number; name: string; made: number | null; source: string | null }
  | { kind: 'set'; line: number; via: string; ref: number; at: number; was: SceneVal }
  | { kind: 'show'; line: number; value: SceneVal; read: CellTouch | null };

export type AliasingScene = {
  lines: { indent: number; text: string }[];
  slots: AliasingSlot[];
  lists: AliasingList[];
  output: SceneVal[];
  writes: CellTouch[];
  reads: CellTouch[];
  step: AliasingStep | null;
};

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toVal(v: unknown): SceneVal | null {
  if (!isRec(v)) return null;
  if (typeof v.num === 'number') return { num: v.num };
  if (typeof v.str === 'string') return { str: v.str };
  if (typeof v.ref === 'number') return { ref: v.ref };
  return null;
}

function toTouch(v: unknown): CellTouch | null {
  if (!isRec(v)) return null;
  if (typeof v.via !== 'string' || typeof v.ref !== 'number' || typeof v.at !== 'number') return null;
  return { via: v.via, ref: v.ref, at: v.at };
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

export const aliasingScene: ScenePlan<AliasingScene> = {
  initial(): AliasingScene {
    return { lines: [], slots: [], lists: [], output: [], writes: [], reads: [], step: null };
  },

  reduce(scene: AliasingScene, event: FacetRuntimeEvent): AliasingScene {
    const p = isRec(event.payload) ? event.payload : {};

    if (event.type === 'start') {
      const raw = Array.isArray(p.lines) ? p.lines : [];
      const lines = raw.filter(isRec).map((ln) => ({
        indent: num(ln.indent),
        text: typeof ln.text === 'string' ? ln.text : '',
      }));
      return { lines, slots: [], lists: [], output: [], writes: [], reads: [], step: { kind: 'start' } };
    }

    if (event.type === 'assign') {
      const name = typeof p.name === 'string' ? p.name : '';
      const value = toVal(p.value) ?? { num: 0 };
      const addr = num(p.addr);
      const had = scene.slots.some((s) => s.name === name);
      const slots = had
        ? scene.slots.map((s) => (s.name === name ? { ...s, val: value } : s))
        : [...scene.slots, { name, addr, val: value }];
      let lists = scene.lists;
      let made: number | null = null;
      if (isRec(p.made) && typeof p.made.ref === 'number' && Array.isArray(p.made.items)) {
        made = p.made.ref;
        const items = p.made.items.map(toVal).map((v) => v ?? { num: 0 });
        lists = [...scene.lists, { ref: made, items }];
      }
      return {
        ...scene,
        slots,
        lists,
        step: {
          kind: 'assign',
          line: num(p.line),
          name,
          made,
          source: typeof p.source === 'string' ? p.source : null,
        },
      };
    }

    if (event.type === 'setItem') {
      const touch = toTouch(p);
      const value = toVal(p.value);
      if (!touch || !value) return { ...scene, step: null };
      const lists = scene.lists.map((l) =>
        l.ref === touch.ref
          ? { ref: l.ref, items: l.items.map((v, i) => (i === touch.at ? value : v)) }
          : l,
      );
      return {
        ...scene,
        lists,
        writes: [...scene.writes, touch],
        step: {
          kind: 'set',
          line: num(p.line),
          ...touch,
          was: toVal(p.old) ?? { num: 0 },
        },
      };
    }

    if (event.type === 'show') {
      const value = toVal(p.value) ?? { num: 0 };
      const read = toTouch(p.read);
      return {
        ...scene,
        output: [...scene.output, value],
        reads: read ? [...scene.reads, read] : scene.reads,
        step: { kind: 'show', line: num(p.line), value, read },
      };
    }

    return scene;
  },
};
