/**
 * 장면 — 바탕(필드 · 축척)과 자취(두 줄의 배치 · 닫힘)와 이번 걸음.
 * 좌표 · 문안 · DOM 은 담지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type FieldOrderSizeSceneField = { name: string; type: string; size: number };
export type FieldOrderSizeSlot = { field: number; from: number; offset: number };
export type FieldOrderSizeClosed = { end: number; size: number };

export type FieldOrderSizeRow = {
  /** 이 줄의 차례. 처음 줄은 선언 차례, 새 줄은 reorder 가 정한다 */
  order: number[];
  /** 지금까지 놓인 필드 */
  slots: FieldOrderSizeSlot[];
  closed: FieldOrderSizeClosed | null;
};

export type FieldOrderSizeStep =
  | { kind: 'init' }
  | { kind: 'place'; field: number; from: number; offset: number }
  | { kind: 'close'; row: 'before' | 'after'; end: number; size: number }
  | { kind: 'reorder' }
  | { kind: 'move'; field: number; from: number; offset: number }
  | null;

export type FieldOrderSizeScene = {
  fields: FieldOrderSizeSceneField[];
  span: number;
  before: FieldOrderSizeRow;
  after: FieldOrderSizeRow | null;
  step: FieldOrderSizeStep;
};

function emptyRow(order: number[]): FieldOrderSizeRow {
  return { order, slots: [], closed: null };
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readFields(v: unknown): FieldOrderSizeSceneField[] {
  if (!Array.isArray(v)) return [];
  const out: FieldOrderSizeSceneField[] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as { name?: unknown; type?: unknown; size?: unknown };
    const size = num(r.size);
    if (typeof r.name !== 'string' || typeof r.type !== 'string' || size === null) continue;
    out.push({ name: r.name, type: r.type, size });
  }
  return out;
}

function readSlot(p: unknown): FieldOrderSizeSlot | null {
  if (typeof p !== 'object' || p === null) return null;
  const r = p as { field?: unknown; from?: unknown; offset?: unknown };
  const field = num(r.field);
  const from = num(r.from);
  const offset = num(r.offset);
  if (field === null || from === null || offset === null) return null;
  return { field, from, offset };
}

export const fieldOrderSizeScene: ScenePlan<FieldOrderSizeScene> = {
  initial(): FieldOrderSizeScene {
    return { fields: [], span: 0, before: emptyRow([]), after: null, step: null };
  },

  reduce(scene, event: FacetRuntimeEvent): FieldOrderSizeScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        const r = (typeof p === 'object' && p !== null ? p : {}) as { fields?: unknown; span?: unknown };
        const fields = readFields(r.fields);
        return {
          fields,
          span: num(r.span) ?? 0,
          before: emptyRow(fields.map((_, i) => i)),
          after: null,
          step: { kind: 'init' },
        };
      }
      case 'place': {
        const slot = readSlot(p);
        if (!slot) return scene;
        return {
          ...scene,
          before: { ...scene.before, slots: [...scene.before.slots, slot] },
          step: { kind: 'place', ...slot },
        };
      }
      case 'close': {
        const r = (typeof p === 'object' && p !== null ? p : {}) as { row?: unknown; end?: unknown; size?: unknown };
        const end = num(r.end);
        const size = num(r.size);
        if (end === null || size === null) return scene;
        if (r.row === 'before') {
          return {
            ...scene,
            before: { ...scene.before, closed: { end, size } },
            step: { kind: 'close', row: 'before', end, size },
          };
        }
        if (r.row === 'after' && scene.after) {
          return {
            ...scene,
            after: { ...scene.after, closed: { end, size } },
            step: { kind: 'close', row: 'after', end, size },
          };
        }
        return scene;
      }
      case 'reorder': {
        const r = (typeof p === 'object' && p !== null ? p : {}) as { order?: unknown };
        const order = Array.isArray(r.order) ? r.order.filter((x): x is number => typeof x === 'number') : [];
        return { ...scene, after: emptyRow(order), step: { kind: 'reorder' } };
      }
      case 'move': {
        const slot = readSlot(p);
        if (!slot || !scene.after) return scene;
        return {
          ...scene,
          after: { ...scene.after, slots: [...scene.after.slots, slot] },
          step: { kind: 'move', ...slot },
        };
      }
      default:
        return scene;
    }
  },
};
