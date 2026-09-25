/**
 * 섀도잉의 장면.
 *
 * 바탕  — lines(화면 글자와 들여쓰기) · names(선언되는 이름). init 이 한 번 정한다
 * 자취  — slots(살아 있는 자리) · open(들어가 있는 몸의 머리줄) · outputs(출력)
 * 이번 걸음 — step. 걷힘(gone)은 그 걸음이 가진다
 *
 * 해석은 알고리즘이 끝냈다. 여기서는 이벤트를 이어 붙이기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneValue = number | string | boolean;
export type SceneLine = { indent: number; text: string };
export type SceneSlot = { addr: number; name: string; value: SceneValue; depth: number };
export type SceneRead = { name: string; addr: number; value: SceneValue };

type StepBase = { line: number; reads: SceneRead[]; gone: SceneSlot[] };
export type ShadowingStep =
  | (StepBase & { kind: 'declare'; name: string; addr: number; depth: number; value: SceneValue })
  | (StepBase & { kind: 'write'; name: string; addr: number; depth: number; before: SceneValue; value: SceneValue })
  | (StepBase & { kind: 'test'; value: SceneValue; opens: boolean })
  | (StepBase & { kind: 'show'; value: SceneValue });

export type ShadowingScene = {
  lines: SceneLine[];
  names: string[];
  slots: SceneSlot[];
  open: number[];
  outputs: SceneValue[];
  step: ShadowingStep | null;
};

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function value(v: unknown): SceneValue {
  return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? v : '';
}

function slotOf(v: unknown): SceneSlot {
  const o = record(v);
  return { addr: num(o.addr), name: str(o.name), value: value(o.value), depth: num(o.depth) };
}

function readsOf(v: unknown): SceneRead[] {
  if (!Array.isArray(v)) return [];
  return v.map((r) => {
    const o = record(r);
    return { name: str(o.name), addr: num(o.addr), value: value(o.value) };
  });
}

/** 걷힌 몸들 — 머리줄 번호와 걷힌 자리. */
function goneOf(v: unknown): { headers: number[]; slots: SceneSlot[] } {
  const headers: number[] = [];
  const slots: SceneSlot[] = [];
  if (!Array.isArray(v)) return { headers, slots };
  for (const g of v) {
    const o = record(g);
    headers.push(num(o.header));
    if (Array.isArray(o.slots)) for (const s of o.slots) slots.push(slotOf(s));
  }
  return { headers, slots };
}

function empty(): ShadowingScene {
  return { lines: [], names: [], slots: [], open: [], outputs: [], step: null };
}

export const shadowingScene: ScenePlan<ShadowingScene> = {
  initial(): ShadowingScene {
    return empty();
  },

  reduce(scene: ShadowingScene, event: FacetRuntimeEvent): ShadowingScene {
    const p = record(event.payload);

    if (event.type === 'init') {
      const lines = Array.isArray(p.lines)
        ? p.lines.map((l) => {
            const o = record(l);
            return { indent: num(o.indent), text: str(o.text) };
          })
        : [];
      const names = Array.isArray(p.names) ? p.names.filter((n): n is string => typeof n === 'string') : [];
      return { ...empty(), lines, names };
    }

    if (event.type !== 'declare' && event.type !== 'write' && event.type !== 'test' && event.type !== 'show') {
      return scene;
    }

    // 걸음 앞의 걷힘 — 몸을 닫고 그 몸의 자리를 치운다.
    const gone = goneOf(p.gone);
    const goneAddrs = new Set(gone.slots.map((s) => s.addr));
    let slots = scene.slots.filter((s) => !goneAddrs.has(s.addr));
    let open = scene.open.filter((h) => !gone.headers.includes(h));
    let outputs = scene.outputs;
    const base: StepBase = { line: num(p.line), reads: readsOf(p.reads), gone: gone.slots };
    let step: ShadowingStep;

    if (event.type === 'declare') {
      const slot = slotOf(p);
      slots = [...slots, slot];
      step = { ...base, kind: 'declare', ...slot };
    } else if (event.type === 'write') {
      const addr = num(p.addr);
      const v = value(p.value);
      slots = slots.map((s) => (s.addr === addr ? { ...s, value: v } : s));
      step = { ...base, kind: 'write', name: str(p.name), addr, depth: num(p.depth), before: value(p.before), value: v };
    } else if (event.type === 'test') {
      const opens = p.opens === true;
      if (opens) open = [...open, base.line];
      step = { ...base, kind: 'test', value: value(p.value), opens };
    } else {
      const v = value(p.value);
      outputs = [...outputs, v];
      step = { ...base, kind: 'show', value: v };
    }

    return { lines: scene.lines, names: scene.names, slots, open, outputs, step };
  },
};
