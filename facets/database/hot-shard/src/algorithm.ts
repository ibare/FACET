/**
 * hotShard — 열쇠 구간으로 나눈 샤드에 늘 커지는 번호가 들어오면, 새 줄이 전부 마지막 구간에 쌓인다.
 *
 * 규약 (사양 그대로)
 *   - 샤드 = `order_id` 가 들어가는 구간. 양 끝을 포함한다. 끝이 `null` 인 구간은 끝이 없다
 *   - 새 번호 = 지금까지의 가장 큰 번호 + 1 (자동 증가)
 *   - 한 걸음에 새 줄 하나
 *   - 세는 것 둘을 가른다 — 있는 줄 수(쌓인 양)와 새 쓰기 수(이 구간이 받은 쓰기)
 *   - 어느 구간에도 들지 않는 번호는 던진다 (C6)
 *
 * 이벤트
 *   init   (silent) { stacks: number[][]; next: number }
 *          — 있던 줄을 구간대로 나눈 결과(샤드마다 order_id 목록, 입력 차례)와 다음 번호.
 *            걸음 0 을 갈아 끼운다
 *   insert { id: number; shard: number; next: number; writes: number[] }
 *          — 새 줄 하나가 제 구간의 샤드에 들어갔다. writes 는 샤드마다 새 쓰기 수(누적)
 *   done   { writes: number[]; shard: number; count: number; total: number; others: number }
 *          — 끝. shard 는 새 쓰기를 가장 많이 받은 샤드, count 는 그 수, total 은 새 줄 수,
 *            others 는 나머지 샤드가 받은 새 쓰기의 합
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ShardRange = { lo: number; hi: number | null };

export type HotShardFacetData = {
  type: 'hot-shard';
  stepMs: number;
  table: string;
  column: string;
  ranges: ShardRange[];
  existing: number[];
  newRows: number;
};

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** initialData 를 좁힌다. 모양이 틀리면 던진다 (C6). */
export function narrowHotShardData(raw: unknown): HotShardFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('hot-shard: initialData 가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'hot-shard') throw new Error('hot-shard: type 이 hot-shard 가 아니다');
  if (!isInt(r.stepMs) || r.stepMs <= 0) throw new Error('hot-shard: stepMs 가 양의 정수가 아니다');
  if (typeof r.table !== 'string' || r.table === '') throw new Error('hot-shard: table 이 없다');
  if (typeof r.column !== 'string' || r.column === '') throw new Error('hot-shard: column 이 없다');
  if (!Array.isArray(r.ranges) || r.ranges.length === 0) throw new Error('hot-shard: ranges 가 없다');
  const ranges: ShardRange[] = r.ranges.map((g: unknown, i: number) => {
    if (typeof g !== 'object' || g === null) throw new Error(`hot-shard: ranges[${i}] 가 객체가 아니다`);
    const o = g as Record<string, unknown>;
    if (!isInt(o.lo)) throw new Error(`hot-shard: ranges[${i}].lo 가 정수가 아니다`);
    if (o.hi !== null && !isInt(o.hi)) throw new Error(`hot-shard: ranges[${i}].hi 가 정수도 null 도 아니다`);
    if (o.hi !== null && o.hi < o.lo) throw new Error(`hot-shard: ranges[${i}] 의 끝이 시작보다 작다`);
    return { lo: o.lo, hi: o.hi };
  });
  if (!Array.isArray(r.existing) || r.existing.length === 0) throw new Error('hot-shard: existing 이 없다');
  const existing = r.existing.map((k: unknown, i: number) => {
    if (!isInt(k)) throw new Error(`hot-shard: existing[${i}] 가 정수가 아니다`);
    return k;
  });
  if (!isInt(r.newRows) || r.newRows <= 0) throw new Error('hot-shard: newRows 가 양의 정수가 아니다');
  return {
    type: 'hot-shard',
    stepMs: r.stepMs,
    table: r.table,
    column: r.column,
    ranges,
    existing,
    newRows: r.newRows,
  };
}

/** 번호가 들어가는 구간의 차례. 양 끝 포함. 어디에도 없으면 던진다. */
export function shardOf(ranges: readonly ShardRange[], key: number): number {
  for (let i = 0; i < ranges.length; i += 1) {
    const g = ranges[i]!;
    if (key >= g.lo && (g.hi === null || key <= g.hi)) return i;
  }
  throw new Error(`hot-shard: order_id ${key} 가 어느 구간에도 들지 않는다`);
}

export async function hotShard(ctx: FacetContext<HotShardFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<HotShardFacetData>;
  const data = narrowHotShardData(ctx.data);
  const { ranges, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 있던 줄을 구간대로 나눈다
  const stacks: number[][] = ranges.map(() => []);
  for (const key of data.existing) {
    if (rctx.cancelled) return;
    stacks[shardOf(ranges, key)]!.push(key);
  }
  let next = Math.max(...data.existing) + 1;
  await rctx.emit({ type: 'init', silent: true, payload: { stacks: stacks.map((s) => [...s]), next } });

  const writes: number[] = ranges.map(() => 0);
  for (let i = 0; i < data.newRows; i += 1) {
    // 걸음 0(고르게 나뉜 있던 줄)을 읽을 틈이 첫 문이다
    if (!(await pause())) return;
    const id = next;
    const shard = shardOf(ranges, id);
    writes[shard] = writes[shard]! + 1;
    next = id + 1;
    await rctx.emit({ type: 'insert', payload: { id, shard, next, writes: [...writes] } });
  }

  if (!(await pause())) return;
  let top = 0;
  for (let s = 1; s < writes.length; s += 1) {
    if (writes[s]! > writes[top]!) top = s;
  }
  const count = writes[top]!;
  const others = writes.reduce((a, b) => a + b, 0) - count;
  await rctx.emit({
    type: 'done',
    payload: { writes: [...writes], shard: top, count, total: data.newRows, others },
  });
}
