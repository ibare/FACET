/**
 * 외부 단편화 장면.
 *
 * 바탕 — 메모리 크기와 덩어리 식별자의 차례(색을 고정하는 데 쓴다).
 * 자취 — 메모리에 놓인 덩어리 · 빈 틈 · 빈 몫 합 · 가장 큰 틈 · 못 들어간 덩어리.
 * 이번 걸음 — `step`. 흐르는 운동의 출발값(`was`)을 싣는다.
 *
 * 틈 찾기 · 합 · 가장 큰 틈은 알고리즘이 셈해 보낸다. 장면은 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneHole = { start: number; len: number };
export type SceneBlock = { id: string; start: number; size: number };

export type FragStep =
  | { kind: 'start' }
  | { kind: 'load'; id: string; start: number; size: number; wasSum: number; wasLargest: number }
  | { kind: 'free'; id: string; start: number; size: number; wasSum: number; wasLargest: number }
  | { kind: 'reject'; id: string; size: number };

export type FragScene = {
  total: number;
  ids: string[];
  blocks: SceneBlock[];
  holes: SceneHole[];
  freeSum: number;
  largest: number;
  /** 못 들어간 덩어리와 대어 본 틈 — 한 번 생기면 남는다 */
  rejected: { id: string; size: number; tried: SceneHole[] } | null;
  step: FragStep;
};

function rec(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`external-fragmentation 장면: ${what} 가 객체가 아니다`);
  }
  return value as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`external-fragmentation 장면: ${key} 가 수가 아니다`);
  }
  return v;
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`external-fragmentation 장면: ${key} 가 문자열이 아니다`);
  return v;
}

function holesAt(o: Record<string, unknown>, key: string): SceneHole[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`external-fragmentation 장면: ${key} 가 배열이 아니다`);
  return v.map((h, i) => {
    const r = rec(h, `${key}[${i}]`);
    return { start: num(r, 'start'), len: num(r, 'len') };
  });
}

export const externalFragmentationScene: ScenePlan<FragScene> = {
  initial(initialData: unknown): FragScene {
    const d = rec(initialData ?? {}, 'initialData');
    const total = typeof d.memoryKiB === 'number' ? d.memoryKiB : 0;
    const ids: string[] = [];
    if (Array.isArray(d.jobs)) {
      for (const j of d.jobs) {
        if (typeof j === 'object' && j !== null) {
          const id = (j as Record<string, unknown>).id;
          if (typeof id === 'string' && !ids.includes(id)) ids.push(id);
        }
      }
    }
    return {
      total,
      ids,
      blocks: [],
      // 처음엔 메모리 전체가 틈 하나다.
      holes: total > 0 ? [{ start: 0, len: total }] : [],
      freeSum: total,
      largest: total,
      rejected: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: FragScene, event: FacetRuntimeEvent): FragScene {
    if (event.type === 'load') {
      const p = rec(event.payload, 'load payload');
      const id = str(p, 'id');
      const start = num(p, 'start');
      const size = num(p, 'size');
      const blocks = [...scene.blocks, { id, start, size }].sort((x, y) => x.start - y.start);
      return {
        ...scene,
        blocks,
        holes: holesAt(p, 'holes'),
        freeSum: num(p, 'freeSum'),
        largest: num(p, 'largest'),
        step: { kind: 'load', id, start, size, wasSum: scene.freeSum, wasLargest: scene.largest },
      };
    }
    if (event.type === 'free') {
      const p = rec(event.payload, 'free payload');
      const id = str(p, 'id');
      const start = num(p, 'start');
      const size = num(p, 'size');
      return {
        ...scene,
        blocks: scene.blocks.filter((b) => b.id !== id),
        holes: holesAt(p, 'holes'),
        freeSum: num(p, 'freeSum'),
        largest: num(p, 'largest'),
        step: { kind: 'free', id, start, size, wasSum: scene.freeSum, wasLargest: scene.largest },
      };
    }
    if (event.type === 'reject') {
      const p = rec(event.payload, 'reject payload');
      const id = str(p, 'id');
      const size = num(p, 'size');
      return {
        ...scene,
        freeSum: num(p, 'freeSum'),
        largest: num(p, 'largest'),
        rejected: { id, size, tried: holesAt(p, 'tried') },
        step: { kind: 'reject', id, size },
      };
    }
    return scene;
  },
};
