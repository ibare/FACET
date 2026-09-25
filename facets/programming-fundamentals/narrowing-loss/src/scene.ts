/**
 * narrowing-loss 장면.
 *
 * 바탕 — `lines`(프로그램 글자) · `slots` 의 이름 · 타입 · 비트 수 (init 이 한 번 정한다)
 * 자취 — 자리마다 든 값과 변환의 흔적 (`conv`), 출력 줄들 (`out`)
 * 이번 걸음 — `line`(밟은 줄) · `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type NarrowingSceneLine = { indent: number; text: string };

export type NarrowingConv = { from: string; before: number; lost: number };

export type NarrowingSlot = {
  name: string;
  type: string;
  bits: number;
  value: number | null;
  conv: NarrowingConv | null;
};

export type NarrowingStep =
  | { kind: 'start' }
  | { kind: 'declare'; name: string; value: number }
  | { kind: 'convert'; name: string; from: string; before: number; value: number; lost: number }
  | { kind: 'output'; name: string | null; value: number };

export type NarrowingLossScene = {
  lines: NarrowingSceneLine[];
  slots: NarrowingSlot[];
  out: number[];
  line: number | null;
  step: NarrowingStep;
};

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function withSlot(
  scene: NarrowingLossScene,
  name: string,
  value: number,
  conv: NarrowingConv | null,
): NarrowingSlot[] {
  return scene.slots.map((s) => (s.name === name ? { ...s, value, conv } : s));
}

export const narrowingLossScene: ScenePlan<NarrowingLossScene> = {
  initial(): NarrowingLossScene {
    return { lines: [], slots: [], out: [], line: null, step: { kind: 'start' } };
  },

  reduce(scene: NarrowingLossScene, event: FacetRuntimeEvent): NarrowingLossScene {
    const p = rec(event.payload);
    if (event.type === 'init') {
      const lines = Array.isArray(p.lines) ? p.lines : [];
      const slots = Array.isArray(p.slots) ? p.slots : [];
      return {
        lines: lines.map((l) => {
          const r = rec(l);
          return { indent: num(r.indent), text: str(r.text) };
        }),
        slots: slots.map((s) => {
          const r = rec(s);
          return { name: str(r.name), type: str(r.type), bits: num(r.bits), value: null, conv: null };
        }),
        out: [],
        line: null,
        step: { kind: 'start' },
      };
    }
    if (event.type === 'declare') {
      const name = str(p.name);
      const value = num(p.value);
      return {
        ...scene,
        slots: withSlot(scene, name, value, null),
        line: num(p.line),
        step: { kind: 'declare', name, value },
      };
    }
    if (event.type === 'convert') {
      const name = str(p.name);
      const from = str(p.from);
      const before = num(p.before);
      const value = num(p.value);
      const lost = num(p.lost);
      return {
        ...scene,
        slots: withSlot(scene, name, value, { from, before, lost }),
        line: num(p.line),
        step: { kind: 'convert', name, from, before, value, lost },
      };
    }
    if (event.type === 'output') {
      const value = num(p.value);
      const name = typeof p.name === 'string' ? p.name : null;
      return {
        ...scene,
        out: [...scene.out, value],
        line: num(p.line),
        step: { kind: 'output', name, value },
      };
    }
    return scene;
  },
};
