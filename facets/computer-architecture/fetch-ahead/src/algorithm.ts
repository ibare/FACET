/**
 * 앞질러 가져오기 — 원소를 차례로 읽는 두 줄기를 같은 시계로 돌린다.
 *
 * 한 줄기는 프리페치가 없다 (줄의 첫 원소를 읽으려 할 때 그 줄을 부른다). 다른 줄기는
 * 다음 줄 프리페치다 (줄 L 의 첫 원소를 읽는 사이클에 줄 L+1 을 함께 부른다). 부른
 * 줄은 `latency` 사이클 뒤에 온다. 읽기 한 번은 1 사이클이고, 줄이 아직 안 왔으면 올
 * 때까지 기다린다.
 *
 * 사이클을 하나씩 돌려 두 줄기에서 일어난 일을 모으고, `CYCLES_PER_STEP` 사이클마다
 * 한 걸음으로 내보낸다.
 *
 * 이벤트
 *   init  (silent) payload { n: number; lineSize: number; latency: number; horizon: number;
 *                            policies: Policy[] }
 *         — 바탕. horizon 은 두 줄기 중 늦게 끝나는 쪽의 총 사이클 (시간 띠의 눈금)
 *   tick           payload { from: number; to: number; lanes: TickLane[] }
 *         — 사이클 [from, to) 에서 줄기마다 일어난 일. lanes 는 policies 순서
 *           TickLane = { requests: { line; at; arrive }[]; reads: { elem; at }[];
 *                        done: { total; waited } | null }
 *           done 은 그 줄기가 이 구간에서 마지막 원소를 다 읽었을 때만 찬다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Policy = 'none' | 'nextLine';

export type FetchAheadFacetData = {
  type: 'fetch-ahead';
  stepMs: number;
  /** 차례로 읽을 원소 수 */
  elements: number;
  /** 캐시 줄 하나에 드는 원소 수 */
  lineSize: number;
  /** 부른 줄이 메모리에서 오는 데 걸리는 사이클 */
  latency: number;
  /** 견줄 줄기들 */
  policies: Policy[];
};

export type LineRequest = { line: number; at: number; arrive: number };
export type ElementRead = { elem: number; at: number };
export type LaneDone = { total: number; waited: number };
export type TickLane = { requests: LineRequest[]; reads: ElementRead[]; done: LaneDone | null };

/** 한 걸음에 묶는 사이클 수. 두 사이클이면 걸음 열여섯으로 가장 긴 줄기가 끝난다. */
const CYCLES_PER_STEP = 2;

type LaneRun = {
  policy: Policy;
  requests: LineRequest[];
  reads: ElementRead[];
  total: number;
  waited: number;
};

/** 한 줄기를 사이클 단위로 끝까지 돌린다. */
function runLane(policy: Policy, n: number, lineSize: number, latency: number): LaneRun {
  const lines = Math.ceil(n / lineSize);
  const arrival = new Map<number, number>();
  const requests: LineRequest[] = [];
  const reads: ElementRead[] = [];
  const ask = (line: number, at: number): void => {
    if (line >= lines || arrival.has(line)) return;
    arrival.set(line, at + latency);
    requests.push({ line, at, arrive: at + latency });
  };
  let next = 0;
  let cycle = 0;
  let waited = 0;
  // 상한: 줄마다 다 기다리고 원소마다 읽어도 이만큼이면 끝난다
  const bound = lines * latency + n;
  while (next < n && cycle < bound) {
    const line = Math.floor(next / lineSize);
    ask(line, cycle);
    const arrive = arrival.get(line) ?? Infinity;
    if (arrive <= cycle) {
      reads.push({ elem: next, at: cycle });
      if (policy === 'nextLine' && next % lineSize === 0) ask(line + 1, cycle);
      next += 1;
    } else {
      waited += 1;
    }
    cycle += 1;
  }
  return { policy, requests, reads, total: cycle, waited };
}

export async function fetchAhead(ctx: FacetContext<FetchAheadFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<FetchAheadFacetData>;
  const { stepMs, elements: n, lineSize, latency, policies } = ctx.data;

  const runs = policies.map((p) => runLane(p, n, lineSize, latency));
  const horizon = runs.reduce((m, r) => Math.max(m, r.total), 0);

  let opened = false;
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    // 첫 걸음은 곧바로 — 마운트 직후 빈 화면으로 머물지 않는다
    if (!opened) {
      opened = true;
      return true;
    }
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { n, lineSize, latency, horizon, policies: [...policies] },
  });

  for (let from = 0; from < horizon; from += CYCLES_PER_STEP) {
    if (!(await pause())) return;
    const to = Math.min(from + CYCLES_PER_STEP, horizon);
    const lanes: TickLane[] = runs.map((r) => ({
      requests: r.requests.filter((q) => q.at >= from && q.at < to).map((q) => ({ ...q })),
      reads: r.reads.filter((q) => q.at >= from && q.at < to).map((q) => ({ ...q })),
      done: r.total > from && r.total <= to ? { total: r.total, waited: r.waited } : null,
    }));
    await ctx.emit({ type: 'tick', payload: { from, to, lanes } });
  }
}
