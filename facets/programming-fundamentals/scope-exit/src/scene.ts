/**
 * 스코프 종료의 장면 — 이벤트를 잇기만 한다. 해석은 알고리즘이 끝냈다.
 *
 * 바탕: lines · bodies (init 이 한 번 정한다)
 * 자취: slots (지금 서 있는 자리) · open (열려 있는 몸의 머리줄) · outputs · halted
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneValue = number | string;
export type SceneLine = { indent: number; text: string };
export type SceneBody = { head: number; from: number; to: number };
/** 서 있는 자리. slot = 그 자리를 잡은 줄 (자리의 식별자). */
export type SceneSlot = { name: string; value: SceneValue; slot: number };
export type SceneRef = { name: string; slot: number };

export type ScopeExitStep =
  | { kind: 'start' }
  | {
      kind: 'assign';
      line: number;
      name: string;
      value: SceneValue;
      was: SceneValue | null;
      declare: boolean;
      slot: number;
      reads: SceneRef[];
    }
  | { kind: 'branch'; line: number; l: SceneValue; op: string; r: SceneValue; result: boolean }
  | { kind: 'exit'; head: number; gone: SceneSlot[] }
  | { kind: 'show'; line: number; value: SceneValue; from: SceneRef | null }
  | { kind: 'unknown'; line: number; name: string };

export type ScopeExitScene = {
  lines: SceneLine[];
  bodies: SceneBody[];
  slots: SceneSlot[];
  open: number[];
  outputs: SceneValue[];
  halted: { line: number; name: string } | null;
  step: ScopeExitStep | null;
};

type Rec = Record<string, unknown>;

function rec(v: unknown): Rec | null {
  return typeof v === 'object' && v !== null ? (v as Rec) : null;
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function val(v: unknown): SceneValue {
  return typeof v === 'number' || typeof v === 'string' ? v : 0;
}
function ref(v: unknown): SceneRef | null {
  const r = rec(v);
  return r ? { name: str(r.name), slot: num(r.slot) } : null;
}
function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function empty(): ScopeExitScene {
  return { lines: [], bodies: [], slots: [], open: [], outputs: [], halted: null, step: null };
}

export const scopeExitScene: ScenePlan<ScopeExitScene> = {
  initial(): ScopeExitScene {
    return empty();
  },

  reduce(scene, event: FacetRuntimeEvent): ScopeExitScene {
    const p = rec(event.payload) ?? {};
    if (event.type === 'init') {
      const lines = list(p.lines).map((x) => {
        const r = rec(x) ?? {};
        return { indent: num(r.indent), text: str(r.text) };
      });
      const bodies = list(p.bodies).map((x) => {
        const r = rec(x) ?? {};
        return { head: num(r.head), from: num(r.from), to: num(r.to) };
      });
      return { ...empty(), lines, bodies, step: { kind: 'start' } };
    }
    if (event.type === 'assign') {
      const step: ScopeExitStep = {
        kind: 'assign',
        line: num(p.line),
        name: str(p.name),
        value: val(p.value),
        was: p.was === null ? null : val(p.was),
        declare: p.declare === true,
        slot: num(p.slot),
        reads: list(p.reads)
          .map(ref)
          .filter((r): r is SceneRef => r !== null),
      };
      const slots = step.declare
        ? [...scene.slots, { name: step.name, value: step.value, slot: step.slot }]
        : scene.slots.map((s) => (s.slot === step.slot ? { ...s, value: step.value } : s));
      return { ...scene, slots, step };
    }
    if (event.type === 'branch') {
      const step: ScopeExitStep = {
        kind: 'branch',
        line: num(p.line),
        l: val(p.l),
        op: str(p.op),
        r: val(p.r),
        result: p.result === true,
      };
      const open = step.result ? [...scene.open, step.line] : scene.open;
      return { ...scene, open, step };
    }
    if (event.type === 'exit') {
      const gone = list(p.gone).map((x) => {
        const r = rec(x) ?? {};
        return { name: str(r.name), value: val(r.value), slot: num(r.slot) };
      });
      const head = num(p.head);
      const goneIds = gone.map((g) => g.slot);
      return {
        ...scene,
        slots: scene.slots.filter((s) => !goneIds.includes(s.slot)),
        open: scene.open.filter((h) => h !== head),
        step: { kind: 'exit', head, gone },
      };
    }
    if (event.type === 'show') {
      const step: ScopeExitStep = {
        kind: 'show',
        line: num(p.line),
        value: val(p.value),
        from: ref(p.from),
      };
      return { ...scene, outputs: [...scene.outputs, step.value], step };
    }
    if (event.type === 'unknownName') {
      const halted = { line: num(p.line), name: str(p.name) };
      return { ...scene, halted, step: { kind: 'unknown', ...halted } };
    }
    return scene;
  },
};
