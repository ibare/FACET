/**
 * pointer-dereference 장면 — 이벤트를 잇기만 한다. 해석은 알고리즘이 했다.
 *
 * 바탕: 줄 글자 · 칸(이름 · 주소)
 * 자취: 칸 내용 · 따라가는 줄마다의 길(읽기 시작한 칸, 건너 닿은 칸들)과 손에 든 것
 * 이번 걸음: step
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type PointerKind = 'value' | 'address';
export type PointerContent = { value: number; kind: PointerKind };

export type PointerTrack = {
  /** 이 길을 낸 줄 (0 부터) */
  line: number;
  /** 수를 처음 읽은 칸 */
  start: number;
  /** 건너 닿은 칸들, 차례대로 */
  path: number[];
  /** 지금 손에 든 것 */
  held: PointerContent;
  /** show 의 출력 (마지막 건넘 뒤에만) */
  output: number | null;
};

export type PointerStep =
  | { k: 'none' }
  | { k: 'assign'; cell: number; source: number | null }
  | { k: 'read'; track: number }
  | { k: 'hop'; track: number; from: number; to: number; was: PointerContent };

export type PointerScene = {
  lines: { indent: number; text: string }[];
  cells: { name: string; addr: number }[];
  contents: (PointerContent | null)[];
  current: number | null;
  tracks: PointerTrack[];
  step: PointerStep;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function kindOf(v: unknown): PointerKind {
  return v === 'address' ? 'address' : 'value';
}

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

export const pointerDereferenceScene: ScenePlan<PointerScene> = {
  initial(): PointerScene {
    return { lines: [], cells: [], contents: [], current: null, tracks: [], step: { k: 'none' } };
  },

  reduce(scene: PointerScene, event: FacetRuntimeEvent): PointerScene {
    const p = record(event.payload);

    if (event.type === 'init') {
      const lines: PointerScene['lines'] = [];
      if (Array.isArray(p.lines)) {
        for (const raw of p.lines) {
          const r = record(raw);
          const indent = num(r.indent);
          if (indent !== null && typeof r.text === 'string') lines.push({ indent, text: r.text });
        }
      }
      const cells: PointerScene['cells'] = [];
      if (Array.isArray(p.cells)) {
        for (const raw of p.cells) {
          const r = record(raw);
          const addr = num(r.addr);
          if (addr !== null && typeof r.name === 'string') cells.push({ name: r.name, addr });
        }
      }
      return {
        lines,
        cells,
        contents: cells.map(() => null),
        current: null,
        tracks: [],
        step: { k: 'none' },
      };
    }

    const line = num(p.line);
    if (line === null) return scene;

    if (event.type === 'assign') {
      const cell = num(p.cell);
      const value = num(p.value);
      if (cell === null || value === null) return scene;
      const contents = scene.contents.slice();
      contents[cell] = { value, kind: kindOf(p.kind) };
      return {
        ...scene,
        contents,
        current: line,
        step: { k: 'assign', cell, source: num(p.source) },
      };
    }

    if (event.type === 'read') {
      const cell = num(p.cell);
      const value = num(p.value);
      if (cell === null || value === null) return scene;
      const track: PointerTrack = {
        line,
        start: cell,
        path: [],
        held: { value, kind: kindOf(p.kind) },
        output: null,
      };
      return {
        ...scene,
        current: line,
        tracks: [...scene.tracks, track],
        step: { k: 'read', track: scene.tracks.length },
      };
    }

    if (event.type === 'hop') {
      const from = num(p.from);
      const to = num(p.to);
      const value = num(p.value);
      const ti = scene.tracks.length - 1;
      const before = scene.tracks[ti];
      if (from === null || to === null || value === null || before === undefined) return scene;
      const held: PointerContent = { value, kind: kindOf(p.kind) };
      const track: PointerTrack = {
        line: before.line,
        start: before.start,
        path: [...before.path, to],
        held,
        output: p.last === true ? value : null,
      };
      const tracks = scene.tracks.slice();
      tracks[ti] = track;
      return {
        ...scene,
        current: line,
        tracks,
        step: { k: 'hop', track: ti, from, to, was: { ...before.held } },
      };
    }

    return scene;
  },
};
