/**
 * closure-captures 의 장면.
 *
 * 바탕 — `lines` (`initial` 이 `initialData` 에서 베낀다)
 * 자취 — 선 틀(`frames`) · 살아 있는 자리(`slots`) · 만들어진 함수(`fns`) · 출력(`out`)
 * 이번 걸음 — `step`. 틀이 걷히는 걸음은 걷힌 틀(`closed`)을 계기값으로 싣는다 —
 *   그 틀 안에서 출발하는 운동을 장면이 말하게 한다
 *
 * 셈은 알고리즘이 했다. 여기서는 발신을 잇기만 한다 — 어느 자리가 살아남는지도 발신이 말한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type CcVal =
  | { t: 'num'; n: number }
  | { t: 'str'; s: string }
  | { t: 'fn'; fn: number; name: string }
  | { t: 'none' };

export type CcLine = { indent: number; text: string };

/** 틀 안의 자리 차례(`order`)는 그 틀이 걷혀도 남긴다 — 걷히는 걸음의 운동이 거기서 출발한다. */
export type CcSlot = {
  id: number;
  name: string;
  value: CcVal;
  /** 지나간 값. 같은 자리가 받은 값들이다 */
  history: CcVal[];
  owner: number | null;
  order: number;
  ownerDepth: number;
  /** 틀이 걷힌 뒤 이 자리를 데리고 다니는 함수 */
  carriedBy: number | null;
};

export type CcFn = {
  id: number;
  name: string;
  owner: number | null;
  order: number;
  ownerDepth: number;
  captures: number[];
};

export type CcFrame = { id: number; callee: string; as: string; depth: number; fn: number | null; items: number };

export type CcThen =
  | { k: 'set'; slot: number; declare: boolean; was: CcVal }
  | { k: 'show'; value: CcVal }
  | { k: 'return'; value: CcVal; srcSlot: number | null }
  | { k: 'expr' };

export type CcStep =
  | { k: 'start' }
  | { k: 'call'; line: number; frame: number }
  | { k: 'make'; line: number; fn: number }
  | { k: 'stmt'; line: number; then: CcThen }
  | { k: 'arrive'; line: number; closed: CcFrame; value: CcVal; kept: number[]; keptFns: number[]; then: CcThen | null };

export type ClosureCapturesScene = {
  lines: CcLine[];
  frames: CcFrame[];
  slots: CcSlot[];
  fns: CcFn[];
  out: CcVal[];
  step: CcStep;
};

function empty(): ClosureCapturesScene {
  return { lines: [], frames: [], slots: [], fns: [], out: [], step: { k: 'start' } };
}

type Loose = { [key: string]: unknown };

function obj(v: unknown): Loose | null {
  return typeof v === 'object' && v !== null ? (v as Loose) : null;
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}

function val(v: unknown): CcVal {
  const o = obj(v);
  if (!o) return { t: 'none' };
  if (o.t === 'num' && typeof o.n === 'number') return { t: 'num', n: o.n };
  if (o.t === 'str' && typeof o.s === 'string') return { t: 'str', s: o.s };
  if (o.t === 'fn' && typeof o.fn === 'number') return { t: 'fn', fn: o.fn, name: str(o.name) };
  return { t: 'none' };
}

function then(v: unknown): CcThen | null {
  const o = obj(v);
  if (!o) return null;
  if (o.k === 'set') return { k: 'set', slot: num(o.slot), declare: o.declare === true, was: val(o.was) };
  if (o.k === 'show') return { k: 'show', value: val(o.value) };
  if (o.k === 'return') return { k: 'return', value: val(o.value), srcSlot: typeof o.srcSlot === 'number' ? o.srcSlot : null };
  if (o.k === 'expr') return { k: 'expr' };
  return null;
}

/** 문의 마무리를 자취에 얹는다. set 은 자리를 세우거나 값을 바꾸고, show 는 출력에 더한다. */
function applyThen(s: ClosureCapturesScene, raw: Loose): ClosureCapturesScene {
  const k = raw.k;
  if (k === 'set') {
    const id = num(raw.slot);
    const value = val(raw.value);
    if (raw.declare === true) {
      const owner = typeof raw.owner === 'number' ? raw.owner : null;
      const top = s.frames.find((f) => f.id === owner) ?? null;
      const slot: CcSlot = {
        id,
        name: str(raw.name),
        value,
        history: [],
        owner,
        order: top ? top.items : 0,
        ownerDepth: top ? top.depth : 0,
        carriedBy: null,
      };
      return {
        ...s,
        slots: [...s.slots, slot],
        frames: s.frames.map((f) => (f === top ? { ...f, items: f.items + 1 } : f)),
      };
    }
    return {
      ...s,
      slots: s.slots.map((sl) => (sl.id === id ? { ...sl, history: [...sl.history, sl.value], value } : sl)),
    };
  }
  if (k === 'show') return { ...s, out: [...s.out, val(raw.value)] };
  return s;
}

export const closureCapturesScene: ScenePlan<ClosureCapturesScene> = {
  initial(initialData: unknown) {
    const lines: CcLine[] = [];
    const raw = obj(initialData)?.lines;
    if (Array.isArray(raw)) {
      for (const l of raw) {
        const o = obj(l);
        if (o) lines.push({ indent: num(o.indent), text: str(o.text) });
      }
    }
    return { ...empty(), lines };
  },
  reduce(scene, event: FacetRuntimeEvent) {
    const p = obj(event.payload) ?? {};
    switch (event.type) {
      case 'call': {
        const frame: CcFrame = {
          id: num(p.frame),
          callee: str(p.callee),
          as: str(p.as),
          depth: num(p.depth),
          fn: typeof p.fn === 'number' ? p.fn : null,
          items: 0,
        };
        const slots: CcSlot[] = [];
        if (Array.isArray(p.args)) {
          for (const a of p.args) {
            const o = obj(a);
            if (!o || o.ref === true) continue;
            slots.push({
              id: num(o.slot),
              name: str(o.param),
              value: val(o.value),
              history: [],
              owner: frame.id,
              order: frame.items + slots.length,
              ownerDepth: frame.depth,
              carriedBy: null,
            });
          }
        }
        return {
          ...scene,
          frames: [...scene.frames, { ...frame, items: slots.length }],
          slots: [...scene.slots, ...slots],
          step: { k: 'call', line: num(p.line), frame: frame.id },
        };
      }
      case 'make': {
        const owner = typeof p.owner === 'number' ? p.owner : null;
        const top = scene.frames.find((f) => f.id === owner) ?? null;
        const fn: CcFn = {
          id: num(p.fn),
          name: str(p.name),
          owner,
          order: top ? top.items : 0,
          ownerDepth: top ? top.depth : 0,
          captures: nums(p.captures),
        };
        return {
          ...scene,
          fns: [...scene.fns, fn],
          frames: scene.frames.map((f) => (f === top ? { ...f, items: f.items + 1 } : f)),
          step: { k: 'make', line: num(p.line), fn: fn.id },
        };
      }
      case 'stmt': {
        const th = then(p);
        const next = applyThen(scene, p);
        return { ...next, step: { k: 'stmt', line: num(p.line), then: th ?? { k: 'expr' } } };
      }
      case 'arrive': {
        const id = num(p.frame);
        const closed = scene.frames.find((f) => f.id === id);
        if (!closed) return scene;
        const kept = new Map<number, number>();
        if (Array.isArray(p.kept)) {
          for (const k of p.kept) {
            const o = obj(k);
            if (o) kept.set(num(o.slot), num(o.by));
          }
        }
        const keptFns = new Set(nums(p.keptFns));
        const slots = scene.slots
          .filter((s) => s.owner !== id || kept.has(s.id))
          .map((s) => (s.owner === id ? { ...s, owner: null, carriedBy: kept.get(s.id) ?? null } : s));
        const fns = scene.fns
          .filter((f) => f.owner !== id || keptFns.has(f.id))
          .map((f) => (f.owner === id ? { ...f, owner: null } : f));
        const base: ClosureCapturesScene = { ...scene, frames: scene.frames.filter((f) => f.id !== id), slots, fns };
        const rawThen = obj(p.then);
        const next = rawThen ? applyThen(base, rawThen) : base;
        return {
          ...next,
          step: {
            k: 'arrive',
            line: num(p.line),
            closed,
            value: val(p.value),
            kept: [...kept.keys()],
            keptFns: [...keptFns],
            then: then(p.then),
          },
        };
      }
      default:
        return scene;
    }
  },
};
