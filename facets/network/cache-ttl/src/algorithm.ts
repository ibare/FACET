/**
 * cache-ttl — 리졸버는 받은 답을 TTL 동안 들고 있다가, 남은 시간이 0 에 닿으면 버린다.
 *
 * 모형 (실제 DNS 를 줄인 자리):
 *   - 시각은 초 단위 정수. 걸음 간격(stepMs)은 재생 속도일 뿐 모형 시각이 아니다.
 *   - 이름 하나 · 레코드 하나만 다룬다. 리졸버의 캐시는 그 한 칸이다.
 *   - 캐시가 비었거나 만료됐으면 권한 서버에 물어 **그 시각의 원본 주소**를 받고
 *     만료 시각 = 지금 + TTL 로 넣는다. 묻는 데 드는 시간은 0.
 *   - 들고 있는 동안(지금 < 만료)은 적중. 남은 TTL = 만료 - 지금 을 함께 준다.
 *   - 만료는 지금 >= 만료 시각. 제 시각에 한 걸음으로 일어난다 (답을 버린다).
 *     같은 시각에 다른 사건과 겹치면 만료가 먼저.
 *   - 권한 서버의 바뀜은 리졸버에 알려지지 않는다.
 *   - 마지막 질문 뒤에 남은 만료는 걸음으로 만들지 않는다.
 *   - 같은 시각의 바뀜과 질문은 바뀜이 먼저다 (이 데이터에서는 겹치지 않는다).
 *
 * 이벤트 (한 걸음 = 사건 하나, 시각 차례. silent 인 것은 없다):
 *   fetch   { t: number; addr: string; expiry: number; remaining: number }
 *           — 들고 있는 답이 없어 권한 서버에 물었다. remaining = 만료 - t (= TTL)
 *   hit     { t: number; addr: string; remaining: number; stale: boolean; origin: string }
 *           — 들고 있던 답을 준다. stale = 준 답이 그 시각의 원본 주소와 다르다
 *   change  { t: number; addr: string; remaining: number | null }
 *           — 권한 서버의 주소가 addr 로 바뀐다. remaining = 리졸버가 들고 있는 답의 남은 TTL (없으면 null)
 *   expire  { t: number; addr: string }
 *           — 남은 TTL 이 0 에 닿아 들고 있던 addr 를 버린다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CacheTtlChange = { t: number; addr: string };

export type CacheTtlFacetData = {
  type: 'cache-ttl';
  stepMs: number;
  /** 묻는 이름 (번역하지 않는 자료) */
  name: string;
  /** 레코드 종류 (번역하지 않는 자료) */
  record: string;
  /** 초 */
  ttl: number;
  /** 시각 0 의 권한 서버 주소 */
  origin: string;
  /** 권한 서버 주소가 바뀌는 시각과 새 주소 */
  changes: CacheTtlChange[];
  /** 질문이 리졸버에 오는 시각 (초) */
  queries: number[];
};

type Pending =
  | { kind: 'change'; t: number; addr: string }
  | { kind: 'query'; t: number };

function isTime(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** 데이터 모양을 확인한다. 모형 밖이면 던진다 (C6). */
export function checkCacheTtlData(d: CacheTtlFacetData): void {
  if (!isTime(d.ttl) || d.ttl <= 0) throw new Error(`cache-ttl: TTL 은 양의 정수여야 한다 (${String(d.ttl)})`);
  if (typeof d.origin !== 'string' || d.origin === '') throw new Error('cache-ttl: 처음 원본 주소가 없다');
  if (!Array.isArray(d.queries) || d.queries.length === 0) throw new Error('cache-ttl: 질문 시각이 없다');
  if (!Array.isArray(d.changes)) throw new Error('cache-ttl: 바뀜 목록이 없다');
  let last = -1;
  for (const q of d.queries) {
    if (!isTime(q)) throw new Error(`cache-ttl: 질문 시각이 정수가 아니다 (${String(q)})`);
    if (q <= last) throw new Error(`cache-ttl: 질문 시각이 차례대로가 아니다 (${q})`);
    last = q;
  }
  last = 0;
  for (const c of d.changes) {
    if (!isTime(c.t) || c.t <= last) throw new Error(`cache-ttl: 바뀜 시각이 차례대로가 아니다 (${String(c.t)})`);
    if (typeof c.addr !== 'string' || c.addr === '') throw new Error(`cache-ttl: 시각 ${c.t} 의 새 주소가 없다`);
    last = c.t;
  }
}

export async function cacheTtl(ctxBase: FacetContext<CacheTtlFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<CacheTtlFacetData>;
  const data = ctx.data;
  checkCacheTtlData(data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 사건 줄 — 바뀜과 질문을 시각 차례로. 같은 시각이면 바뀜이 먼저.
  const pending: Pending[] = [
    ...data.changes.map((c): Pending => ({ kind: 'change', t: c.t, addr: c.addr })),
    ...data.queries.map((t): Pending => ({ kind: 'query', t })),
  ].sort((a, b) => a.t - b.t || (a.kind === 'change' ? -1 : 1) - (b.kind === 'change' ? -1 : 1));

  let origin = data.origin;
  let cache: { addr: string; expiry: number } | null = null;
  let i = 0;

  while (i < pending.length) {
    // 걸음 0 은 이미 읽을 것이 있는 화면이다 — 모든 걸음 앞에 한 번씩 머문다.
    if (!(await pause())) return;

    // 가장 이른 만료가 다음 사건보다 이르거나 같으면 만료가 먼저.
    const next = pending[i];
    if (next === undefined) throw new Error(`cache-ttl: 사건 ${i} 가 없다`);
    if (cache !== null && cache.expiry <= next.t) {
      const dropped: { addr: string; expiry: number } = cache;
      cache = null;
      await ctx.emit({ type: 'expire', payload: { t: dropped.expiry, addr: dropped.addr } });
      continue;
    }
    i += 1;
    const t = next.t;

    if (next.kind === 'change') {
      origin = next.addr;
      await ctx.emit({
        type: 'change',
        payload: { t, addr: origin, remaining: cache === null ? null : cache.expiry - t },
      });
      continue;
    }

    if (cache !== null && t < cache.expiry) {
      await ctx.emit({
        type: 'hit',
        payload: {
          t,
          addr: cache.addr,
          remaining: cache.expiry - t,
          stale: cache.addr !== origin,
          origin,
        },
      });
      continue;
    }

    cache = { addr: origin, expiry: t + data.ttl };
    await ctx.emit({
      type: 'fetch',
      payload: { t, addr: cache.addr, expiry: cache.expiry, remaining: cache.expiry - t },
    });
  }
  // 마지막 질문 뒤에 남은 만료는 걸음으로 만들지 않는다 (사양의 규약).
}
