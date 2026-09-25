/**
 * value-in-place 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 했다.
 *
 * 바탕 : lines · slotCount (init 이 한 번 정한다)
 * 자취 : slots (잡힌 차례대로, 이름 · 주소 · 지금 값) · out (보인 값)
 * 이번 : step (방금 밟은 줄과 그 값이 어디서 왔나)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneValue = number | string;

export type SceneLine = { indent: number; text: string };

export type SceneSlot = { name: string; addr: number; value: SceneValue };

export type SceneStep = {
  line: number;
  kind: 'assign' | 'show';
  name?: string;
  declare: boolean;
  value: SceneValue;
  was?: SceneValue;
  from: 'literal' | 'slot' | 'calc';
  src?: string;
  last: boolean;
};

export type ValueInPlaceScene = {
  lines: SceneLine[];
  slotCount: number;
  slots: SceneSlot[];
  out: SceneValue[];
  step: SceneStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function asValue(v: unknown): SceneValue | undefined {
  return typeof v === 'number' || typeof v === 'string' ? v : undefined;
}

function readLines(v: unknown): SceneLine[] {
  if (!Array.isArray(v)) return [];
  const out: SceneLine[] = [];
  for (const item of v) {
    if (!isRecord(item)) continue;
    const indent = typeof item.indent === 'number' ? item.indent : 0;
    const text = typeof item.text === 'string' ? item.text : '';
    out.push({ indent, text });
  }
  return out;
}

function readStep(p: Record<string, unknown>): SceneStep | null {
  const value = asValue(p.value);
  if (typeof p.line !== 'number' || value === undefined) return null;
  if (p.kind !== 'assign' && p.kind !== 'show') return null;
  const from = p.from === 'slot' || p.from === 'calc' ? p.from : 'literal';
  const step: SceneStep = {
    line: p.line,
    kind: p.kind,
    declare: p.declare === true,
    value,
    from,
    last: p.last === true,
  };
  if (typeof p.name === 'string') step.name = p.name;
  const was = asValue(p.was);
  if (was !== undefined) step.was = was;
  if (typeof p.src === 'string') step.src = p.src;
  return step;
}

export const valueInPlaceScene: ScenePlan<ValueInPlaceScene> = {
  initial(): ValueInPlaceScene {
    return { lines: [], slotCount: 0, slots: [], out: [], step: null };
  },

  reduce(scene: ValueInPlaceScene, event: FacetRuntimeEvent): ValueInPlaceScene {
    const p = isRecord(event.payload) ? event.payload : {};

    if (event.type === 'init') {
      return {
        lines: readLines(p.lines),
        slotCount: typeof p.slotCount === 'number' ? p.slotCount : 0,
        slots: [],
        out: [],
        step: null,
      };
    }

    if (event.type === 'step') {
      const step = readStep(p);
      if (!step) return scene;
      let slots = scene.slots;
      let out = scene.out;
      if (step.kind === 'assign' && step.name !== undefined) {
        const name = step.name;
        const addr = typeof p.addr === 'number' ? p.addr : 0;
        if (step.declare) {
          slots = [...scene.slots, { name, addr, value: step.value }];
        } else {
          slots = scene.slots.map((s) => (s.name === name ? { ...s, value: step.value } : s));
        }
      } else if (step.kind === 'show') {
        out = [...scene.out, step.value];
      }
      return { ...scene, slots, out, step };
    }

    return scene;
  },
};
