/**
 * 정렬과 패딩의 장면.
 *
 * - 바탕: `fields`(이름 · 형 · 크기 · 정렬) 와 `span`(칸 폭을 고정할 완성 크기) — init 이 한 번 정한다
 * - 자취: `placed`(앉은 필드마다 닿은 자리와 앉은 자리) · `tail` · `total`
 * - 이번 걸음: `step` — 운동을 고르고 캡션을 정한다
 *
 * 좌표 · 문안 · DOM 은 담지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type PaddingGapSceneField = {
  name: string;
  type: string;
  size: number;
  align: number;
};

/** 앉은 필드 — 앞 끝 `from` 에 닿았다가 `offset` 에 앉았다. */
export type PaddingGapPlaced = { from: number; offset: number };

export type PaddingGapTail = { end: number; size: number; align: number };

export type PaddingGapTotal = { size: number; sum: number; gaps: number };

export type PaddingGapStep =
  | { kind: 'init' }
  | { kind: 'place'; index: number; from: number; offset: number }
  | ({ kind: 'tail' } & PaddingGapTail)
  | ({ kind: 'total' } & PaddingGapTotal);

export type PaddingGapScene = {
  fields: PaddingGapSceneField[];
  span: number;
  placed: PaddingGapPlaced[];
  tail: PaddingGapTail | null;
  total: PaddingGapTotal | null;
  step: PaddingGapStep | null;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readFields(v: unknown): PaddingGapSceneField[] | null {
  if (!Array.isArray(v)) return null;
  const out: PaddingGapSceneField[] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) return null;
    const o = item as { name?: unknown; type?: unknown; size?: unknown; align?: unknown };
    const size = num(o.size);
    const align = num(o.align);
    if (typeof o.name !== 'string' || typeof o.type !== 'string' || size === null || align === null) {
      return null;
    }
    out.push({ name: o.name, type: o.type, size, align });
  }
  return out;
}

function empty(): PaddingGapScene {
  return { fields: [], span: 0, placed: [], tail: null, total: null, step: null };
}

export const paddingGapScene: ScenePlan<PaddingGapScene> = {
  initial(): PaddingGapScene {
    return empty();
  },

  reduce(scene: PaddingGapScene, event: FacetRuntimeEvent): PaddingGapScene {
    const p = (typeof event.payload === 'object' && event.payload !== null ? event.payload : {}) as Record<
      string,
      unknown
    >;
    switch (event.type) {
      case 'init': {
        const fields = readFields(p.fields);
        const span = num(p.span);
        if (fields === null || span === null) return scene;
        return { ...empty(), fields, span, step: { kind: 'init' } };
      }
      case 'place': {
        const index = num(p.index);
        const from = num(p.from);
        const offset = num(p.offset);
        if (index === null || from === null || offset === null) return scene;
        return {
          ...scene,
          placed: [...scene.placed, { from, offset }],
          step: { kind: 'place', index, from, offset },
        };
      }
      case 'tail': {
        const end = num(p.end);
        const size = num(p.size);
        const align = num(p.align);
        if (end === null || size === null || align === null) return scene;
        const tail = { end, size, align };
        return { ...scene, tail, step: { kind: 'tail', ...tail } };
      }
      case 'total': {
        const size = num(p.size);
        const sum = num(p.sum);
        const gaps = num(p.gaps);
        if (size === null || sum === null || gaps === null) return scene;
        const total = { size, sum, gaps };
        return { ...scene, total, step: { kind: 'total', ...total } };
      }
      default:
        return scene;
    }
  },
};
