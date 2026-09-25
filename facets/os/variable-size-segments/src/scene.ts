/**
 * variableSizeSegmentsScene — 이벤트를 장면으로 잇는다. 셈(틈 찾기)은 알고리즘이 했고
 * 장면은 받은 값을 베껴 쌓기만 한다.
 *
 *   바탕  total · used · segments  (initialData 에서) · 처음 holes (init 에서)
 *   자취  cut · placed · holes
 *   이번  step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SegHole = { start: number; size: number };
export type SegUsed = { id: string; kind: 'os' | 'process'; start: number; size: number };
export type SegPiece = { id: string; size: number };
export type SegPlaced = { id: string; start: number; size: number };

export type SegStep =
  | { kind: 'start' }
  | { kind: 'cut' }
  | { kind: 'place'; id: string; start: number; size: number; into: SegHole; skipped: SegHole[] };

export type VariableSizeSegmentsScene = {
  total: number;
  used: SegUsed[];
  segments: SegPiece[];
  holes: SegHole[];
  cut: boolean;
  placed: SegPlaced[];
  step: SegStep;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`variableSizeSegmentsScene: ${what} 가 객체가 아니다`);
  }
  return v as Record<string, unknown>;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`variableSizeSegmentsScene: ${what} 가 수가 아니다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string' || v === '') throw new Error(`variableSizeSegmentsScene: ${what} 가 빈 글자다`);
  return v;
}

function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`variableSizeSegmentsScene: ${what} 가 배열이 아니다`);
  return v;
}

function readHole(v: unknown, what: string): SegHole {
  const o = rec(v, what);
  return { start: num(o.start, `${what}.start`), size: num(o.size, `${what}.size`) };
}

function readHoles(v: unknown, what: string): SegHole[] {
  return arr(v, what).map((h, i) => readHole(h, `${what}[${i}]`));
}

export const variableSizeSegmentsScene: ScenePlan<VariableSizeSegmentsScene> = {
  initial(initialData: unknown): VariableSizeSegmentsScene {
    const d = rec(initialData, 'initialData');
    const used = arr(d.used, 'used').map((u, i): SegUsed => {
      const o = rec(u, `used[${i}]`);
      const kind = o.kind;
      if (kind !== 'os' && kind !== 'process') throw new Error(`variableSizeSegmentsScene: used[${i}].kind 를 모른다`);
      return {
        id: str(o.id, `used[${i}].id`),
        kind,
        start: num(o.start, `used[${i}].start`),
        size: num(o.size, `used[${i}].size`),
      };
    });
    const segments = arr(d.segments, 'segments').map((s, i): SegPiece => {
      const o = rec(s, `segments[${i}]`);
      return { id: str(o.id, `segments[${i}].id`), size: num(o.size, `segments[${i}].size`) };
    });
    return {
      total: num(d.memoryKiB, 'memoryKiB'),
      used,
      segments,
      holes: [],
      cut: false,
      placed: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: VariableSizeSegmentsScene, event: FacetRuntimeEvent): VariableSizeSegmentsScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        const o = rec(p, 'init.payload');
        return { ...scene, holes: readHoles(o.holes, 'init.holes'), step: { kind: 'start' } };
      }
      case 'cut':
        return { ...scene, cut: true, step: { kind: 'cut' } };
      case 'place': {
        const o = rec(p, 'place.payload');
        const id = str(o.id, 'place.id');
        const start = num(o.start, 'place.start');
        const size = num(o.size, 'place.size');
        return {
          ...scene,
          placed: [...scene.placed, { id, start, size }],
          holes: readHoles(o.holes, 'place.holes'),
          step: {
            kind: 'place',
            id,
            start,
            size,
            into: readHole(o.into, 'place.into'),
            skipped: readHoles(o.skipped, 'place.skipped'),
          },
        };
      }
      default:
        throw new Error(`variableSizeSegmentsScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
