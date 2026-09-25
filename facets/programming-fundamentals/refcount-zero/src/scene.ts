/**
 * 참조 계수의 장면.
 *
 * 바탕 — `lines` · `slots` (`initial` 이 initialData 에서 한 번 정한다. 칸은 알고리즘과 같은 `outerSlots`)
 * 자취 — `vals` (칸마다 든 값, 비었으면 null) · `objects` (살아 있는 객체와 그 수) · `swept` (치운 객체)
 * 이번 걸음 — `step`. 오르내림을 흘리려고 그 걸음 앞의 객체들(`before`)을 계기값으로 싣는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { outerSlots, type Line, type Obj, type Val } from './algorithm.js';

export type SceneLine = { indent: number; text: string };
export type SceneSlot = { name: string; addr: number };

export type RefcountStep =
  | { k: 'start' }
  | {
      k: 'line';
      line: number;
      name: string;
      was: Val | null;
      now: Val;
      created: string | null;
      before: Obj[];
    }
  | { k: 'sweep'; obj: Obj };

export type RefcountZeroScene = {
  lines: SceneLine[];
  slots: SceneSlot[];
  vals: (Val | null)[];
  objects: Obj[];
  swept: string[];
  step: RefcountStep;
};

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function readVal(v: unknown): Val | null {
  const r = rec(v);
  if (!r) return null;
  if (r.k === 'null') return { k: 'null' };
  if (r.k === 'num' && typeof r.n === 'number') return { k: 'num', n: r.n };
  if (r.k === 'ref' && typeof r.obj === 'string') return { k: 'ref', obj: r.obj };
  return null;
}

function readObjects(v: unknown): Obj[] {
  if (!Array.isArray(v)) return [];
  const out: Obj[] = [];
  for (const item of v) {
    const r = rec(item);
    if (!r || typeof r.name !== 'string' || typeof r.count !== 'number') continue;
    const holders = Array.isArray(r.holders)
      ? r.holders.filter((h): h is string => typeof h === 'string')
      : [];
    out.push({ name: r.name, count: r.count, holders });
  }
  return out;
}

/** 바탕의 줄 — 칸을 셈하는 데 드는 구조(`stmt`)까지 베껴 둔다. 넘겨받은 자료를 쥐지 않는다. */
function readLines(v: unknown): Line[] {
  if (!Array.isArray(v)) return [];
  const out: Line[] = [];
  for (const item of v) {
    const r = rec(item);
    const st = rec(r?.stmt);
    if (!r || !st || typeof r.indent !== 'number' || typeof r.text !== 'string') continue;
    if (st.k !== 'assign' || typeof st.to !== 'string') continue;
    out.push({
      indent: r.indent,
      text: r.text,
      stmt: { k: 'assign', to: st.to, declare: st.declare === true, value: { null: true } },
    });
  }
  return out;
}

function copyObjects(list: readonly Obj[]): Obj[] {
  return list.map((o) => ({ name: o.name, count: o.count, holders: [...o.holders] }));
}

export const refcountZeroScene: ScenePlan<RefcountZeroScene> = {
  initial(initialData: unknown): RefcountZeroScene {
    const lines = readLines(rec(initialData)?.lines);
    const slots = outerSlots(lines).map((x) => ({ name: x.name, addr: x.addr }));
    return {
      lines: lines.map((ln) => ({ indent: ln.indent, text: ln.text })),
      slots,
      vals: slots.map(() => null),
      objects: [],
      swept: [],
      step: { k: 'start' },
    };
  },

  reduce(scene: RefcountZeroScene, event: FacetRuntimeEvent): RefcountZeroScene {
    const p = rec(event.payload);
    if (!p) return scene;

    if (event.type === 'line') {
      const now = readVal(p.value);
      if (typeof p.line !== 'number' || typeof p.name !== 'string' || !now) return scene;
      const name = p.name;
      const at = scene.slots.findIndex((s) => s.name === name);
      const vals = scene.vals.map((v) => (v ? { ...v } : null));
      const was = at >= 0 ? scene.vals[at] : null;
      if (at >= 0) vals[at] = now;
      return {
        lines: scene.lines,
        slots: scene.slots,
        vals,
        objects: readObjects(p.objects),
        swept: [...scene.swept],
        step: {
          k: 'line',
          line: p.line,
          name,
          was: was ? { ...was } : null,
          now,
          created: typeof p.created === 'string' ? p.created : null,
          before: copyObjects(scene.objects),
        },
      };
    }

    if (event.type === 'sweep') {
      if (typeof p.obj !== 'string') return scene;
      const name = p.obj;
      const gone = scene.objects.find((o) => o.name === name) ?? { name, count: 0, holders: [] };
      return {
        lines: scene.lines,
        slots: scene.slots,
        vals: scene.vals.map((v) => (v ? { ...v } : null)),
        objects: readObjects(p.objects),
        swept: [...scene.swept, name],
        step: { k: 'sweep', obj: { name: gone.name, count: gone.count, holders: [...gone.holders] } },
      };
    }

    return scene;
  },
};
