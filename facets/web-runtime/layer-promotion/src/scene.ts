/**
 * layer-promotion 장면.
 *
 * - 바탕(`base`) — initialData 에서 베낀 두 장 · 옮기는 요소 · 겹침. 걸음 0 이 이것으로 선다
 * - 자취 — 바뀜이 일어났는가, 페이지 장에서 지운 자리 · 새로 칠한 자리, 요소마다 다시 칠한 것, 합성했는가
 * - 이번 걸음(`step`) — 지금 무엇이 일어났는가 (종류와 인자만)
 *
 * 셈(무엇을 다시 칠하는가)은 알고리즘이 하고 이벤트에 싣는다. 장면은 잇기만 한다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneMove = { id: string; before: string[]; after: string[] };
export type ScenePromoted = { id: string; decl: string };

export type LayerBase = {
  page: string[];
  promoted: ScenePromoted[];
  change: string;
  moves: SceneMove[];
};

export type LayerStep =
  | { kind: 'start' }
  | { kind: 'change'; ids: string[] }
  | { kind: 'repaint'; id: string; spot: 'before' | 'after'; items: string[] }
  | { kind: 'composite'; slid: string[] };

export type LayerScene = {
  base: LayerBase;
  /** transform 이 바뀌었는가 */
  changed: boolean;
  /** 페이지 장에서 옛 자리를 다시 칠한 요소 (그 자리에서 지워졌다) */
  erased: string[];
  /** 페이지 장에서 새 자리에 칠한 요소 */
  placed: string[];
  /** 옮긴 요소마다 다시 칠한 서로 다른 요소 — 요소 차례는 base.moves 를 따른다 */
  repainted: { id: string; items: string[] }[];
  /** 합성으로 놓는 자리만 옮긴 제 장 */
  slid: string[];
  step: LayerStep;
};

function strings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === 'string') out.push(x);
  return out;
}

function readBase(raw: unknown): LayerBase {
  const empty: LayerBase = { page: [], promoted: [], change: '', moves: [] };
  if (typeof raw !== 'object' || raw === null) return empty;
  const r = raw as Record<string, unknown>;
  const promoted: ScenePromoted[] = [];
  if (Array.isArray(r.promoted)) {
    for (const p of r.promoted) {
      if (typeof p !== 'object' || p === null) continue;
      const o = p as Record<string, unknown>;
      if (typeof o.id === 'string' && typeof o.decl === 'string') promoted.push({ id: o.id, decl: o.decl });
    }
  }
  const moves: SceneMove[] = [];
  if (Array.isArray(r.moves)) {
    for (const m of r.moves) {
      if (typeof m !== 'object' || m === null) continue;
      const o = m as Record<string, unknown>;
      if (typeof o.id !== 'string') continue;
      moves.push({ id: o.id, before: strings(o.before), after: strings(o.after) });
    }
  }
  return {
    page: strings(r.page),
    promoted,
    change: typeof r.change === 'string' ? r.change : '',
    moves,
  };
}

function initial(initialData: unknown): LayerScene {
  const base = readBase(initialData);
  return {
    base,
    changed: false,
    erased: [],
    placed: [],
    repainted: base.moves.map((m) => ({ id: m.id, items: [] })),
    slid: [],
    step: { kind: 'start' },
  };
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
}

function reduce(scene: LayerScene, event: FacetRuntimeEvent): LayerScene {
  const p = payloadOf(event);
  switch (event.type) {
    case 'change':
      return { ...scene, changed: true, step: { kind: 'change', ids: strings(p.ids) } };
    case 'repaint': {
      const id = typeof p.id === 'string' ? p.id : '';
      const spot = p.spot === 'after' ? 'after' : 'before';
      const items = strings(p.items);
      const total = strings(p.total);
      return {
        ...scene,
        erased: spot === 'before' && !scene.erased.includes(id) ? [...scene.erased, id] : scene.erased,
        placed: spot === 'after' && !scene.placed.includes(id) ? [...scene.placed, id] : scene.placed,
        repainted: scene.repainted.map((r) => (r.id === id ? { id, items: total } : r)),
        step: { kind: 'repaint', id, spot, items },
      };
    }
    case 'composite': {
      const slid: string[] = [];
      const repaintedBy = new Map<string, string[]>();
      if (Array.isArray(p.slid)) {
        for (const s of p.slid) {
          if (typeof s !== 'object' || s === null) continue;
          const o = s as Record<string, unknown>;
          if (typeof o.id !== 'string') continue;
          slid.push(o.id);
          repaintedBy.set(o.id, strings(o.repainted));
        }
      }
      return {
        ...scene,
        slid,
        repainted: scene.repainted.map((r) => {
          const got = repaintedBy.get(r.id);
          return got === undefined ? r : { id: r.id, items: got };
        }),
        step: { kind: 'composite', slid },
      };
    }
    default:
      return scene;
  }
}

export const layerPromotionScene: ScenePlan<LayerScene> = { initial, reduce };
