/**
 * 행 우선과 열 우선의 장면.
 *
 * - 바탕: 없다. 배열 값과 캐시 크기는 stage 가 `initialData` 에서 좁혀 쓴다
 * - 자취: 순회마다 지금까지의 읽기 (`row` · `col`). 캐시 안의 줄과 합은 여기서 파생된다
 * - 이번 걸음: 어느 순회의 바깥 루프 몇 번째인가 (`step`). 이번 걸음의 읽기는 자취의 꼬리다
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { SweepPayload, Walk, WalkRead } from './algorithm.js';

export type RowVsColumnWalkScene = {
  row: WalkRead[];
  col: WalkRead[];
  /** 이번 걸음. `count` 는 이번에 더해진 읽기 수 — 자취 꼬리에서 그만큼이 이번 것이다 */
  step: { walk: Walk; outer: number; count: number } | null;
};

function isRead(v: unknown): v is WalkRead {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.r === 'number' &&
    typeof o.c === 'number' &&
    typeof o.line === 'number' &&
    typeof o.hit === 'boolean' &&
    typeof o.slot === 'number' &&
    (o.evicted === null || typeof o.evicted === 'number') &&
    typeof o.acc === 'number'
  );
}

function asSweep(payload: unknown): SweepPayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const o = payload as Record<string, unknown>;
  if (o.walk !== 'row' && o.walk !== 'col') return null;
  if (typeof o.outer !== 'number' || !Array.isArray(o.reads) || !o.reads.every(isRead)) return null;
  return { walk: o.walk, outer: o.outer, reads: o.reads };
}

export const rowVsColumnWalkScene: ScenePlan<RowVsColumnWalkScene> = {
  initial(): RowVsColumnWalkScene {
    return { row: [], col: [], step: null };
  },
  reduce(scene: RowVsColumnWalkScene, event: FacetRuntimeEvent): RowVsColumnWalkScene {
    if (event.type !== 'sweep') return scene;
    const p = asSweep(event.payload);
    if (!p) return scene;
    const added = p.reads.map((x) => ({ ...x }));
    const step = { walk: p.walk, outer: p.outer, count: added.length };
    return p.walk === 'row'
      ? { row: [...scene.row, ...added], col: scene.col, step }
      : { row: scene.row, col: [...scene.col, ...added], step };
  },
};
