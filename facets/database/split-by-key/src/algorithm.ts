/**
 * split-by-key — 열쇠 값 하나가 줄의 샤드를 정하고, 조회도 그 셈으로 곧장 간다.
 *
 * 규약 (사양 그대로):
 *   - 샤드 = 열쇠 값 mod 샤드 수. 다른 해시를 쓰지 않는다.
 *   - 한 걸음에 줄 하나가 데이터 차례로 옮겨 간다. 샤드 안의 줄 차례 = 도착한 차례.
 *   - 조회는 같은 셈으로 샤드 하나를 고르고 그 샤드 안에서만 찾는다.
 *
 * 발신 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *   - `place`  { row: number; shard: number }
 *       rows[row] 가 샤드 shard 로 옮겨 간다. shard = rows[row] 의 열쇠 mod shardCount.
 *   - `route`  { key: number; shard: number }
 *       조회 열쇠 key 가 같은 셈으로 샤드 shard 하나로 간다.
 *   - `found`  { shard: number; row: number; scanned: number; looked: number }
 *       샤드 shard 안에서 도착 차례로 훑어 scanned 번째(1 부터)에 rows[row] 를 찾았다.
 *       looked = 들여다본 샤드 수.
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 채운다 (줄 전부가 한곳에, 샤드는 비었다).
 * 걸음 0 에 읽을 것이 있으므로 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SplitByKeyFacetData = {
  type: 'split-by-key';
  stepMs: number;
  /** 표 이름 (자료 — 번역하지 않는다) */
  table: string;
  /** 열쇠 열 이름 */
  keyColumn: string;
  /** 값 열 이름 */
  valueColumn: string;
  /** 줄 — [열쇠, 값]. 이 차례로 옮긴다 */
  rows: ReadonlyArray<readonly [number, number]>;
  /** 샤드 수. 샤드 번호는 0 부터 */
  shardCount: number;
  /** 조회 열쇠 */
  lookupKey: number;
};

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** 자료가 규약을 셈할 수 있는 모양인지 본다. 아니면 던진다 (C6). */
export function checkSplitByKeyData(data: SplitByKeyFacetData): void {
  if (!Number.isInteger(data.shardCount) || data.shardCount < 1) {
    throw new Error(`split-by-key: 샤드 수가 양의 정수가 아니다 — ${String(data.shardCount)}`);
  }
  if (!isNonNegInt(data.lookupKey)) {
    throw new Error(`split-by-key: 조회 열쇠가 음이 아닌 정수가 아니다 — ${String(data.lookupKey)}`);
  }
  const seen = new Set<number>();
  data.rows.forEach((r, i) => {
    if (!Array.isArray(r) || r.length !== 2) {
      throw new Error(`split-by-key: 줄 ${i} 이 [열쇠, 값] 모양이 아니다`);
    }
    const [k, v] = r;
    if (!isNonNegInt(k)) throw new Error(`split-by-key: 줄 ${i} 의 열쇠가 음이 아닌 정수가 아니다`);
    if (typeof v !== 'number') throw new Error(`split-by-key: 줄 ${i} 의 값이 수가 아니다`);
    if (seen.has(k)) throw new Error(`split-by-key: 열쇠 ${k} 가 두 번 나온다`);
    seen.add(k);
  });
}

export async function splitByKey(
  context: FacetContext<SplitByKeyFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<SplitByKeyFacetData>;
  const data = ctx.data;
  checkSplitByKeyData(data);
  const stepMs = data.stepMs;
  const k = data.shardCount;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  /** 샤드마다 도착한 줄 번호 — 도착 차례 */
  const shards: number[][] = Array.from({ length: k }, () => []);

  for (let i = 0; i < data.rows.length; i += 1) {
    if (!(await pause())) return;
    const row = data.rows[i];
    if (row === undefined) throw new Error(`split-by-key: 줄 ${i} 이 없다`);
    const shard = row[0] % k;
    const bucket = shards[shard];
    if (bucket === undefined) throw new Error(`split-by-key: 샤드 ${shard} 가 없다`);
    bucket.push(i);
    await ctx.emit({ type: 'place', payload: { row: i, shard } });
  }

  if (!(await pause())) return;
  const key = data.lookupKey;
  const target = key % k;
  await ctx.emit({ type: 'route', payload: { key, shard: target } });

  if (!(await pause())) return;
  const bucket = shards[target];
  if (bucket === undefined) throw new Error(`split-by-key: 샤드 ${target} 가 없다`);
  let hit = -1;
  let scanned = 0;
  /** 안을 들여다본 샤드 — 조회는 고른 샤드 하나만 훑는다 */
  const opened = new Set<number>([target]);
  for (const r of bucket) {
    if (ctx.cancelled) return;
    scanned += 1;
    const row = data.rows[r];
    if (row === undefined) throw new Error(`split-by-key: 줄 ${r} 이 없다`);
    if (row[0] === key) {
      hit = r;
      break;
    }
  }
  if (hit < 0) {
    throw new Error(`split-by-key: 샤드 ${target} 에 열쇠 ${key} 인 줄이 없다`);
  }
  await ctx.emit({ type: 'found', payload: { shard: target, row: hit, scanned, looked: opened.size } });
}
