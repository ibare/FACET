/**
 * split-by-key 의 장면 — 이벤트를 잇기만 한다. 샤드 셈은 알고리즘이 한다.
 *
 * 바탕: 표 이름 · 열 이름 · 줄 · 샤드 수 (initial 이 initialData 에서 베낀다)
 * 자취: placed (도착 차례의 [줄, 샤드]) · query · found
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SplitRow = { readonly id: number; readonly value: number };

export type SplitStep =
  | { readonly kind: 'start' }
  | { readonly kind: 'place'; readonly row: number; readonly shard: number }
  | { readonly kind: 'route' }
  | { readonly kind: 'found' };

export type SplitByKeyScene = {
  readonly table: string;
  readonly keyColumn: string;
  readonly valueColumn: string;
  readonly rows: readonly SplitRow[];
  readonly shardCount: number;
  /** 옮겨 간 줄 — 도착 차례. 샤드 안의 차례도 이것에서 나온다 */
  readonly placed: readonly { readonly row: number; readonly shard: number }[];
  readonly query: { readonly key: number; readonly shard: number } | null;
  readonly found: {
    readonly shard: number;
    readonly row: number;
    readonly scanned: number;
    readonly looked: number;
  } | null;
  readonly step: SplitStep;
};

function need<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`split-by-key 장면: ${what} 가 없다`);
  return v;
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`split-by-key 장면: ${key} 가 문자열이 아니다`);
  return v;
}

function int(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`split-by-key 장면: ${key} 가 정수가 아니다`);
  }
  return v;
}

function record(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`split-by-key 장면: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

export const splitByKeyScene: ScenePlan<SplitByKeyScene> = {
  initial(initialData: unknown): SplitByKeyScene {
    const d = record(initialData, 'initialData');
    const raw = d.rows;
    if (!Array.isArray(raw)) throw new Error('split-by-key 장면: rows 가 배열이 아니다');
    const rows: SplitRow[] = raw.map((r: unknown, i) => {
      if (!Array.isArray(r) || r.length !== 2) {
        throw new Error(`split-by-key 장면: 줄 ${i} 이 [열쇠, 값] 모양이 아니다`);
      }
      const id: unknown = r[0];
      const value: unknown = r[1];
      if (typeof id !== 'number' || typeof value !== 'number') {
        throw new Error(`split-by-key 장면: 줄 ${i} 에 수가 아닌 칸이 있다`);
      }
      return { id, value };
    });
    return {
      table: str(d, 'table'),
      keyColumn: str(d, 'keyColumn'),
      valueColumn: str(d, 'valueColumn'),
      rows,
      shardCount: int(d, 'shardCount'),
      placed: [],
      query: null,
      found: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: SplitByKeyScene, event: FacetRuntimeEvent): SplitByKeyScene {
    const p = record(event.payload, `${event.type} payload`);
    if (event.type === 'place') {
      const row = int(p, 'row');
      const shard = int(p, 'shard');
      need(scene.rows[row], `줄 ${row}`);
      if (shard < 0 || shard >= scene.shardCount) throw new Error(`split-by-key 장면: 샤드 ${shard} 가 없다`);
      return {
        ...scene,
        placed: [...scene.placed, { row, shard }],
        step: { kind: 'place', row, shard },
      };
    }
    if (event.type === 'route') {
      const shard = int(p, 'shard');
      if (shard < 0 || shard >= scene.shardCount) throw new Error(`split-by-key 장면: 샤드 ${shard} 가 없다`);
      return { ...scene, query: { key: int(p, 'key'), shard }, step: { kind: 'route' } };
    }
    if (event.type === 'found') {
      const row = int(p, 'row');
      need(scene.rows[row], `줄 ${row}`);
      return {
        ...scene,
        found: { shard: int(p, 'shard'), row, scanned: int(p, 'scanned'), looked: int(p, 'looked') },
        step: { kind: 'found' },
      };
    }
    throw new Error(`split-by-key 장면: 모르는 이벤트 ${event.type}`);
  },
};
