/**
 * hotShardScene — 이벤트를 장면으로 잇는다. 셈(어느 샤드인가 · 몇 번째 쓰기인가)은 알고리즘이 했다.
 *
 * 바탕   table · column · ranges · newRows (initialData 에서 베낀다)
 * 자취   stacks (샤드마다 쌓인 줄, 아래에서 위로) · writes (샤드마다 새 쓰기 수) · next (다음 번호)
 * 이번 걸음  step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowHotShardData } from './algorithm.js';

export type HotShardRow = { id: number; fresh: boolean };

export type HotShardStep =
  | { kind: 'start'; existing: number }
  | { kind: 'insert'; id: number; shard: number }
  | { kind: 'done'; shard: number; count: number; total: number; others: number };

export type HotShardScene = {
  table: string;
  column: string;
  ranges: { lo: number; hi: number | null }[];
  newRows: number;
  stacks: HotShardRow[][];
  writes: number[];
  next: number | null;
  step: HotShardStep | null;
};

function intOf(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`hotShardScene: ${type}.${key} 가 정수가 아니다`);
  return v;
}

function intsOf(p: Record<string, unknown>, key: string, type: string): number[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`hotShardScene: ${type}.${key} 가 배열이 아니다`);
  return v.map((x: unknown) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) throw new Error(`hotShardScene: ${type}.${key} 에 정수가 아닌 값`);
    return x;
  });
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`hotShardScene: ${event.type} 의 payload 가 없다`);
  return p as Record<string, unknown>;
}

export const hotShardScene: ScenePlan<HotShardScene> = {
  initial(initialData: unknown): HotShardScene {
    const d = narrowHotShardData(initialData);
    return {
      table: d.table,
      column: d.column,
      ranges: d.ranges.map((g) => ({ lo: g.lo, hi: g.hi })),
      newRows: d.newRows,
      stacks: d.ranges.map(() => []),
      writes: d.ranges.map(() => 0),
      next: null,
      step: null,
    };
  },

  reduce(scene: HotShardScene, event: FacetRuntimeEvent): HotShardScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const raw = p.stacks;
        if (!Array.isArray(raw) || raw.length !== scene.ranges.length) {
          throw new Error('hotShardScene: init.stacks 의 수가 구간 수와 다르다');
        }
        const stacks = raw.map((s: unknown, i: number) => {
          if (!Array.isArray(s)) throw new Error(`hotShardScene: init.stacks[${i}] 가 배열이 아니다`);
          return s.map((k: unknown) => {
            if (typeof k !== 'number' || !Number.isInteger(k)) throw new Error('hotShardScene: init.stacks 에 정수가 아닌 값');
            return { id: k, fresh: false };
          });
        });
        const existing = stacks.reduce((a, s) => a + s.length, 0);
        return {
          ...scene,
          stacks,
          writes: scene.ranges.map(() => 0),
          next: intOf(p, 'next', 'init'),
          step: { kind: 'start', existing },
        };
      }
      case 'insert': {
        const p = payloadOf(event);
        const id = intOf(p, 'id', 'insert');
        const shard = intOf(p, 'shard', 'insert');
        if (shard < 0 || shard >= scene.stacks.length) throw new Error(`hotShardScene: 없는 샤드 ${shard}`);
        const writes = intsOf(p, 'writes', 'insert');
        if (writes.length !== scene.ranges.length) throw new Error('hotShardScene: insert.writes 의 수가 구간 수와 다르다');
        const stacks = scene.stacks.map((s, i) => (i === shard ? [...s, { id, fresh: true }] : s.map((r) => ({ ...r }))));
        return {
          ...scene,
          stacks,
          writes,
          next: intOf(p, 'next', 'insert'),
          step: { kind: 'insert', id, shard },
        };
      }
      case 'done': {
        const p = payloadOf(event);
        const writes = intsOf(p, 'writes', 'done');
        if (writes.length !== scene.ranges.length) throw new Error('hotShardScene: done.writes 의 수가 구간 수와 다르다');
        return {
          ...scene,
          stacks: scene.stacks.map((s) => s.map((r) => ({ ...r }))),
          writes,
          step: {
            kind: 'done',
            shard: intOf(p, 'shard', 'done'),
            count: intOf(p, 'count', 'done'),
            total: intOf(p, 'total', 'done'),
            others: intOf(p, 'others', 'done'),
          },
        };
      }
      default:
        throw new Error(`hotShardScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
