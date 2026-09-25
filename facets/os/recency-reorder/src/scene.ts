/**
 * 최근 사용 갱신 — 장면.
 *
 * 바탕: 프레임 수 · 참조 목록 (initialData 에서 베낀다)
 * 자취: 걸음마다의 줄 한 벌 (`columns`). 첫 벌은 처음 줄
 * 이번 걸음: `columns` 의 마지막 벌
 *
 * 셈(당길 자리 · 내보낼 페이지 · 새 줄)은 알고리즘이 했다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type RecencyColumn =
  | { kind: 'start'; order: number[] }
  | { kind: 'hit'; page: number; from: number; order: number[] }
  | { kind: 'fault'; page: number; out: number; order: number[] };

export type RecencyScene = {
  frames: number;
  refs: number[];
  columns: RecencyColumn[];
};

function numArray(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number') return null;
    out.push(x);
  }
  return out;
}

function field(obj: unknown, key: string): unknown {
  if (typeof obj !== 'object' || obj === null) return undefined;
  return (obj as Record<string, unknown>)[key];
}

export const recencyReorderScene: ScenePlan<RecencyScene> = {
  initial(initialData: unknown): RecencyScene {
    const order = numArray(field(initialData, 'order'));
    const refs = numArray(field(initialData, 'refs'));
    const frames = field(initialData, 'frames');
    if (order === null || refs === null || typeof frames !== 'number') {
      return { frames: 0, refs: [], columns: [] };
    }
    return { frames, refs: [...refs], columns: [{ kind: 'start', order: [...order] }] };
  },

  reduce(scene: RecencyScene, event: FacetRuntimeEvent): RecencyScene {
    if (event.type !== 'hit' && event.type !== 'fault') return scene;
    const p = event.payload;
    const page = field(p, 'page');
    const order = numArray(field(p, 'order'));
    if (typeof page !== 'number' || order === null) {
      throw new Error(`recency-reorder: ${event.type} 의 payload 에 page · order 가 없다`);
    }
    if (event.type === 'hit') {
      const from = field(p, 'from');
      if (typeof from !== 'number') throw new Error('recency-reorder: hit 의 payload 에 from 이 없다');
      return { ...scene, columns: [...scene.columns, { kind: 'hit', page, from, order }] };
    }
    const out = field(p, 'out');
    if (typeof out !== 'number') throw new Error('recency-reorder: fault 의 payload 에 out 이 없다');
    return { ...scene, columns: [...scene.columns, { kind: 'fault', page, out, order }] };
  },
};
