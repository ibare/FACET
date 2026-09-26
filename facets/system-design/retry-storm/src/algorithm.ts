/**
 * retry-storm — 끊긴 동안 실패한 요청이 바로 다음 틱에 다시 와 쌓이고, 서버가 살아난 틱에
 * 새 요청과 한꺼번에 덮친다.
 *
 * 모형: 시각의 단위는 틱. 틱마다 새 요청이 `freshPerTick` 개 온다 (식별자 `q1`, `q2`, … 차례대로).
 * 서버는 살아 있으면 틱마다 `capacity` 개를 받고, `downTicks` 에 든 틱이면 하나도 받지 않는다.
 * 실패한 요청은 기다림 없이 **다음 틱에** 다시 온다 (백오프 없음 · 포기 없음). 망 지연 0,
 * 받은 요청은 그 틱에 끝난다.
 * 한 틱 안의 차례: 새 요청과 다시 온 요청을 모아 처음 온 틱이 이른 것부터, 같으면 번호 차례로
 * 줄 세운다. 끊긴 틱이면 모두 실패, 살아 있으면 앞의 `capacity` 개를 받고 나머지는 실패한다.
 *
 * 셈은 전부 여기서 끝낸다 — 장면은 이벤트를 잇기만 한다.
 *
 * 이벤트 (발신 차례대로):
 *
 *   init   silent: true
 *     payload { ticks: number; capacity: number; maxLoad: number }
 *       ticks    — 틱 수 (틱 0..ticks-1)
 *       capacity — 살아 있는 틱의 감당
 *       maxLoad  — 모든 틱을 통틀어 가장 큰 몰림 (그림의 세로 축척)
 *
 *   tick   (틱마다 하나, 걸음)
 *     payload {
 *       tick: number;          — 이 틱의 번호
 *       down: boolean;         — 서버가 끊긴 틱인가
 *       recovered: boolean;    — 앞 틱이 끊겼고 이 틱은 살아 있는가 (살아난 첫 틱)
 *       retry: string[];       — 다시 온 요청 (앞 틱에 실패한 차례 그대로 = 앞 틱의 다시 올 것)
 *       fresh: string[];       — 이 틱에 새로 온 요청
 *       order: string[];       — 받는 차례로 줄 세운 몰림 전체 (retry + fresh 의 순열)
 *       served: number;        — order 의 앞에서 받은 수
 *       failed: string[];      — 실패한 요청 (order 의 served 뒤 전부) = 다음 틱에 다시 올 것
 *       last: { afterTicks: number; afterFailed: number } | null
 *                              — 마지막 틱에만. 끊긴 틱 뒤 살아 있는데도 실패가 난 틱 수와 그 실패 합
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RetryStormFacetData = {
  type: 'retry-storm';
  stepMs: number;
  /** 틱 수 — 틱 0..ticks-1 */
  ticks: number;
  /** 틱마다 새로 오는 요청 수 */
  freshPerTick: number;
  /** 살아 있는 틱의 감당 */
  capacity: number;
  /** 서버가 끊긴 틱 */
  downTicks: number[];
  /** 요청 식별자 머리 (`q` → q1, q2, …) */
  idPrefix: string;
};

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** 자료 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다. 장면의 initial 도 이것을 부른다. */
export function narrowRetryStormData(raw: unknown): RetryStormFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('retry-storm: 자료가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'retry-storm') throw new Error(`retry-storm: type 이 'retry-storm' 이 아니다 (${String(d.type)})`);
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) throw new Error('retry-storm: stepMs 가 양수가 아니다');
  if (!isCount(d.ticks) || d.ticks < 1) throw new Error('retry-storm: ticks 가 1 이상의 정수가 아니다');
  if (!isCount(d.freshPerTick) || d.freshPerTick < 1) throw new Error('retry-storm: freshPerTick 가 1 이상의 정수가 아니다');
  if (!isCount(d.capacity) || d.capacity < 1) throw new Error('retry-storm: capacity 가 1 이상의 정수가 아니다');
  if (!Array.isArray(d.downTicks)) throw new Error('retry-storm: downTicks 가 배열이 아니다');
  const ticks = d.ticks;
  const downTicks = d.downTicks.map((v, i) => {
    if (!isCount(v) || v >= ticks) throw new Error(`retry-storm: downTicks[${i}] 가 0..${ticks - 1} 의 정수가 아니다`);
    return v;
  });
  if (new Set(downTicks).size !== downTicks.length) throw new Error('retry-storm: downTicks 에 겹친 틱이 있다');
  if (typeof d.idPrefix !== 'string' || d.idPrefix === '') throw new Error('retry-storm: idPrefix 가 빈 문자열이다');
  return {
    type: 'retry-storm',
    stepMs: d.stepMs,
    ticks,
    freshPerTick: d.freshPerTick,
    capacity: d.capacity,
    downTicks,
    idPrefix: d.idPrefix,
  };
}

export type RetryStormRow = {
  tick: number;
  down: boolean;
  recovered: boolean;
  retry: string[];
  fresh: string[];
  order: string[];
  served: number;
  failed: string[];
};

/** 틱 0..ticks-1 을 끝까지 셈한다. */
export function simulateRetryStorm(data: RetryStormFacetData): RetryStormRow[] {
  const born = new Map<string, { tick: number; n: number }>();
  const down = new Set(data.downTicks);
  const rows: RetryStormRow[] = [];
  let next = 0;
  let pending: string[] = [];
  for (let tick = 0; tick < data.ticks; tick += 1) {
    const fresh: string[] = [];
    for (let k = 0; k < data.freshPerTick; k += 1) {
      next += 1;
      const id = `${data.idPrefix}${next}`;
      born.set(id, { tick, n: next });
      fresh.push(id);
    }
    const retry = pending;
    const birth = (id: string): { tick: number; n: number } => {
      const b = born.get(id);
      if (!b) throw new Error(`retry-storm: 요청 ${id} 의 출생 기록이 없다`);
      return b;
    };
    // 받는 차례: 처음 온 틱이 이른 것부터, 같으면 번호 차례
    const order = [...retry, ...fresh].sort((a, b) => {
      const x = birth(a);
      const y = birth(b);
      return x.tick - y.tick || x.n - y.n;
    });
    const isDown = down.has(tick);
    const served = isDown ? 0 : Math.min(data.capacity, order.length);
    const failed = order.slice(served);
    rows.push({
      tick,
      down: isDown,
      recovered: !isDown && down.has(tick - 1),
      retry,
      fresh,
      order,
      served,
      failed,
    });
    pending = failed;
  }
  return rows;
}

export async function retryStorm(context: FacetContext<RetryStormFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<RetryStormFacetData>;
  const data = narrowRetryStormData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const rows = simulateRetryStorm(data);
  const maxLoad = Math.max(...rows.map((r) => r.order.length));
  const firstDown = data.downTicks.length > 0 ? Math.min(...data.downTicks) : data.ticks;
  const after = rows.filter((r) => !r.down && r.tick > firstDown && r.failed.length > 0);
  const afterFailed = after.reduce((s, r) => s + r.failed.length, 0);

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { ticks: data.ticks, capacity: data.capacity, maxLoad },
  });

  // 걸음 0 은 이미 읽을 것이 있는 화면(비어 있는 틱 칸 · 감당 선)이라 첫 발신 앞에 읽을 틈을 둔다
  for (const row of rows) {
    if (!(await pause())) return;
    const isLast = row.tick === data.ticks - 1;
    await ctx.emit({
      type: 'tick',
      payload: {
        tick: row.tick,
        down: row.down,
        recovered: row.recovered,
        retry: row.retry,
        fresh: row.fresh,
        order: row.order,
        served: row.served,
        failed: row.failed,
        last: isLast ? { afterTicks: after.length, afterFailed } : null,
      },
    });
  }
}
