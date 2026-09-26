/**
 * evict-least-frequent — 가득 찬 캐시가 횟수가 가장 적은 키를 버린다 (캐시 안 LFU).
 *
 * 요청 경로를 온 차례대로 하나씩 받는다. 한 걸음 = 요청 하나.
 *   - 적중: 그 키의 횟수 +1, 마지막 쓴 때 = 이번 요청 번호.
 *   - 실패: 캐시가 가득 찼으면 횟수가 가장 적은 키를 버린다. 횟수가 같으면 그중
 *     마지막으로 쓴 때가 가장 오래된 키. 그다음 새 키를 횟수 1 로 넣는다.
 *     캐시 밖의 키는 횟수를 기억하지 않는다 — 밀려났다 돌아오면 1 부터.
 *
 * 걸음 0 은 장면의 `initial()` 이 자료(요청 줄 · 용량 · 빈 캐시)에서 세운다. 첫 발신 앞에
 * stepMs 만큼 머문다 — 걸음 0 에 읽을 요청 줄이 있다.
 *
 * 이벤트 (모두 silent 아님. 요청 번호 `index` 는 1 부터):
 *   hit   { index: number; key: string; count: number; lastUsed: number }
 *           — count 는 늘린 뒤의 횟수, lastUsed 는 index 와 같다
 *   admit { index: number; key: string; count: number; lastUsed: number }
 *           — 빈 자리에 들어옴. count 는 1
 *   evict { index: number; key: string; count: number; lastUsed: number;
 *           victim: { key: string; count: number; lastUsed: number };
 *           least: number;
 *           ties: { key: string; lastUsed: number }[] }
 *           — 밀려남과 들어옴이 한 걸음. least 는 버릴 때의 가장 적은 횟수,
 *             ties 는 그 횟수를 가진 키 전부(victim 포함, 캐시 안 차례)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EvictLeastFrequentFacetData = {
  type: 'evict-least-frequent';
  capacity: number;
  requests: string[];
  stepMs: number;
};

/** 캐시 안 한 키의 기록. */
export type LfuEntry = { key: string; count: number; lastUsed: number };

/** `ctx.data` · 장면 `initial` 이 함께 부르는 좁히개. 모양이 어긋나면 던진다. */
export function readEvictLeastFrequentData(raw: unknown): EvictLeastFrequentFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('evict-least-frequent: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'evict-least-frequent') {
    throw new Error(`evict-least-frequent: initialData.type 이 어긋났다 (${String(d.type)})`);
  }
  const capacity = d.capacity;
  if (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 1) {
    throw new Error('evict-least-frequent: initialData.capacity 는 1 이상의 정수여야 한다');
  }
  const stepMs = d.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('evict-least-frequent: initialData.stepMs 는 양수여야 한다');
  }
  const requests = d.requests;
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error('evict-least-frequent: initialData.requests 는 비지 않은 배열이어야 한다');
  }
  const out: string[] = [];
  requests.forEach((r, i) => {
    if (typeof r !== 'string' || r.length === 0) {
      throw new Error(`evict-least-frequent: initialData.requests[${i}] 가 경로 문자열이 아니다`);
    }
    out.push(r);
  });
  return { type: 'evict-least-frequent', capacity, requests: out, stepMs };
}

/**
 * 가득 찬 캐시에서 버릴 키를 고른다 — 횟수가 가장 적은 것, 같으면 마지막 쓴 때가 가장 오래된 것.
 * 마지막 쓴 때까지 같은 두 키는 한 캐시에 있을 수 없다(한 요청은 한 키) — 만나면 던진다.
 */
export function pickVictim(cache: readonly LfuEntry[]): {
  victim: LfuEntry;
  least: number;
  ties: LfuEntry[];
} {
  if (cache.length === 0) throw new Error('evict-least-frequent: 빈 캐시에서 버릴 키를 고를 수 없다');
  const least = Math.min(...cache.map((e) => e.count));
  const ties = cache.filter((e) => e.count === least);
  const oldest = Math.min(...ties.map((e) => e.lastUsed));
  const matches = ties.filter((e) => e.lastUsed === oldest);
  if (matches.length !== 1) {
    throw new Error(`evict-least-frequent: 마지막 쓴 때 ${oldest} 가 겹친다 — 동률을 풀 수 없다`);
  }
  return { victim: matches[0]!, least, ties };
}

export async function evictLeastFrequent(
  ctxIn: FacetContext<EvictLeastFrequentFacetData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<EvictLeastFrequentFacetData>;
  const data = readEvictLeastFrequentData(ctx.data);
  const { stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 캐시 안 차례를 지킨다 — 버린 자리 대신 새 키가 끝에 붙는다.
  let cache: LfuEntry[] = [];

  for (let i = 0; i < data.requests.length; i += 1) {
    if (!(await pause())) return;
    const key = data.requests[i]!;
    const index = i + 1;
    const found = cache.find((e) => e.key === key);
    if (found) {
      const count = found.count + 1;
      cache = cache.map((e) => (e.key === key ? { key, count, lastUsed: index } : e));
      await ctx.emit({ type: 'hit', payload: { index, key, count, lastUsed: index } });
      continue;
    }
    if (cache.length < data.capacity) {
      cache = [...cache, { key, count: 1, lastUsed: index }];
      await ctx.emit({ type: 'admit', payload: { index, key, count: 1, lastUsed: index } });
      continue;
    }
    const { victim, least, ties } = pickVictim(cache);
    cache = [...cache.filter((e) => e.key !== victim.key), { key, count: 1, lastUsed: index }];
    await ctx.emit({
      type: 'evict',
      payload: {
        index,
        key,
        count: 1,
        lastUsed: index,
        victim: { key: victim.key, count: victim.count, lastUsed: victim.lastUsed },
        least,
        ties: ties.map((e) => ({ key: e.key, lastUsed: e.lastUsed })),
      },
    });
  }
}
