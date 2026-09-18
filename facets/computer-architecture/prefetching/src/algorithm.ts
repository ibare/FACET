/**
 * 프리페치 — 쓸 줄을 미리 부르면 기다림이 사라지는가, 얼마나 앞서 불러야 하는가.
 *
 * 배열 `n` 원소를 앞에서부터 한 박자에 하나씩 쓴다. 원소 `lineElems` 개가 한 줄이고,
 * 캐시에 없는 줄은 메모리에서 `latency` 박자 뒤에 도착한다. 캐시는 `cacheLines` 줄 ·
 * 완전 연관 · LRU 이며 판마다 빈 채로 시작한다. 손잡이 `distance` 는 줄의 첫 원소를
 * 쓸 때 몇 줄 앞의 줄을 미리 부를지다 (0 이면 미리 부르지 않는다).
 *
 * ── 한 원소 i (줄 L = i // lineElems) 의 차례 — 사양의 규약 그대로
 *   1. L 이 캐시에 없으면 미스 — 가득하면 LRU 를 내보내고 L 을 넣는다 (도착 = t + latency)
 *   2. L 의 도착이 t 보다 뒤면 도착까지 멈춘다. 오는 중인 줄에 닿은 것은 미스가 아니다
 *   3. L 에 쓰임 도장을 찍는다
 *   4. i 가 줄의 첫 원소이고 distance > 0 이면 줄 L + distance 를 미리 부른다
 *      (배열 안이고 캐시에 없을 때만. 넣는 방법은 1 과 같다)
 *   5. t += 1
 *   도장은 하나의 증가하는 시계 — 넣을 때와 쓸 때마다 +1. 오는 중인 줄도 자리를 차지한다.
 *   내보낸 줄이 미리 부른 채 한 번도 안 쓰였으면 버린 선반입이다.
 *
 * ── 이벤트 (전부 non-silent, phase 만 silent)
 *   'round'     { distance: number }                                  판의 시작 (캐시를 비운다)
 *   'evict'     { line, slot, at, wasted: boolean }                   줄 하나가 캐시에서 밀려난다
 *   'fetch'     { i, line, slot, kind: 'demand' | 'prefetch', issue, arrive, stamp }
 *                                                                     줄 하나가 메모리를 떠난다
 *   'wait'      { i, line, from, to, prefetched: boolean }            오는 중인 줄을 기다린다
 *   'touch'     { i, line, at, stamp }                                원소 i 를 쓴다
 *   'tick'      { i, t }                                              원소 하나의 일이 끝난 시각
 *   'round-end' { distance, cycles, stall, miss, wasted }             판의 끝
 *   'phase'     { phase }  silent
 *
 * ── 걸음 (sleep 경계) — 원소 하나가 최대 셋으로 나뉜다
 *   [미스]  'miss' (내보냄이 있으면 'evict' 가 켜진 채)   ─ 미스일 때만
 *   [기다림] 'stall' — 멈춘 박자만큼 길다                  ─ 도착 전일 때만
 *   [쓰기]  'touch' (줄의 첫 원소면 'prefetch', 내보냄이 있으면 'evict')
 *
 * ── phase 어휘 (irs.ts 와 같은 집합 — C3)
 *   'miss' | 'evict' | 'stall' | 'touch' | 'prefetch' | 'done'
 *
 * ── 메트릭 (판마다 0 에서 다시 — 누적하지 않는다)
 *   'cycle-count'       지금까지 흐른 박자 (판 끝에서 = 끝의 t)
 *   'stall-cycle-count' 그중 멈춘 박자
 *   'miss-count'        캐시에 없던 줄에 닿은 횟수
 *   'wasted-count'      쓰이기 전에 밀려난 미리 부른 줄
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type PrefetchingData = {
  type: 'prefetching';
  /** 배열 원소 수 */
  n: number;
  /** 한 줄에 드는 원소 수 */
  lineElems: number;
  /** 메모리에서 줄 하나가 오는 박자 */
  latency: number;
  /** 캐시가 담는 줄 수 */
  cacheLines: number;
  /** 손잡이 사다리 — 앞선 거리(줄 수) */
  distances: number[];
  /** 처음 판의 거리 */
  distance: number;
};

/** 줄의 상태 — IR 의 `state` 버퍼와 같은 부호. */
const EMPTY = 0;
const DEMAND = 1;
const PREFETCHED = 2;
const PREFETCH_USED = 3;

export type PrefetchFetch = {
  line: number;
  slot: number;
  kind: 'demand' | 'prefetch';
  issue: number;
  arrive: number;
  stamp: number;
  evicted: { line: number; slot: number; wasted: boolean } | null;
};

/** 원소 하나의 차례. */
export type PrefetchStep = {
  i: number;
  line: number;
  /** 차례가 시작된 시각 */
  start: number;
  /** 미스였다면 그 불러오기 */
  miss: PrefetchFetch | null;
  /** 멈춘 박자 (0 이면 안 멈춤) */
  stall: number;
  /** 기다린 줄이 미리 부른 줄이었는가 */
  waitedOnPrefetch: boolean;
  /** 원소를 쓴 시각 (= start + stall) */
  use: number;
  /** 쓸 때 찍은 도장 */
  useStamp: number;
  /** 미리 부른 줄 */
  prefetch: PrefetchFetch | null;
  /** 차례가 끝난 시각 (= use + 1) */
  end: number;
};

export type PrefetchingResult = {
  steps: PrefetchStep[];
  cycles: number;
  stall: number;
  miss: number;
  wasted: number;
};

/**
 * 한 판을 끝까지 셈한다. 알고리즘과 검사가 같은 셈을 쓴다.
 * ctx 를 받지 않는 순수 함수라 C8 의 대상이 아니다.
 */
export function computePrefetchingResult(data: PrefetchingData, distance: number): PrefetchingResult {
  const lines = Math.floor(data.n / data.lineElems);
  const arrive = new Array<number>(lines).fill(0);
  const stamp = new Array<number>(lines).fill(0);
  const state = new Array<number>(lines).fill(EMPTY);
  const slotOf = new Array<number>(lines).fill(-1);
  const slots = new Array<number>(data.cacheLines).fill(-1);
  let clock = 0;
  let t = 0;
  let stall = 0;
  let miss = 0;
  let wasted = 0;
  const steps: PrefetchStep[] = [];

  /** 자리를 하나 비운다 — 가득할 때만 도장이 가장 작은 줄을 내보낸다. */
  const makeRoom = (): { slot: number; evicted: PrefetchFetch['evicted'] } => {
    const free = slots.indexOf(-1);
    if (free >= 0) return { slot: free, evicted: null };
    let victim = -1;
    for (let k = 0; k < lines; k += 1) {
      if (state[k] === EMPTY) continue;
      if (victim < 0 || stamp[k]! < stamp[victim]!) victim = k;
    }
    const lost = state[victim] === PREFETCHED;
    if (lost) wasted += 1;
    const slot = slotOf[victim]!;
    state[victim] = EMPTY;
    slotOf[victim] = -1;
    slots[slot] = -1;
    return { slot, evicted: { line: victim, slot, wasted: lost } };
  };

  const bring = (line: number, kind: 'demand' | 'prefetch'): PrefetchFetch => {
    const { slot, evicted } = makeRoom();
    state[line] = kind === 'demand' ? DEMAND : PREFETCHED;
    arrive[line] = t + data.latency;
    clock += 1;
    stamp[line] = clock;
    slotOf[line] = slot;
    slots[slot] = line;
    return { line, slot, kind, issue: t, arrive: arrive[line]!, stamp: clock, evicted };
  };

  for (let i = 0; i < data.n; i += 1) {
    const line = Math.floor(i / data.lineElems);
    const start = t;
    let missFetch: PrefetchFetch | null = null;
    if (state[line] === EMPTY) {
      miss += 1;
      missFetch = bring(line, 'demand');
    }
    let waited = 0;
    const waitedOnPrefetch = state[line] === PREFETCHED;
    if (arrive[line]! > t) {
      waited = arrive[line]! - t;
      stall += waited;
      t = arrive[line]!;
    }
    const use = t;
    clock += 1;
    stamp[line] = clock;
    const useStamp = clock;
    if (state[line] === PREFETCHED) state[line] = PREFETCH_USED;
    let prefetch: PrefetchFetch | null = null;
    if (i % data.lineElems === 0 && distance > 0) {
      const ahead = line + distance;
      if (ahead < lines && state[ahead] === EMPTY) prefetch = bring(ahead, 'prefetch');
    }
    t += 1;
    steps.push({
      i,
      line,
      start,
      miss: missFetch,
      stall: waited,
      waitedOnPrefetch: waited > 0 && waitedOnPrefetch,
      use,
      useStamp,
      prefetch,
      end: t,
    });
  }
  return { steps, cycles: t, stall, miss, wasted };
}

/** 걸음 간격. 사양의 제안 300. */
const STEP_MS = 300;
/** 미스 걸음의 길이 — 줄이 메모리를 떠나는 것을 보인다. */
const MISS_MS = 200;
/** 멈춘 박자 하나가 화면에서 흐르는 시간. 멈춤이 길수록 기다림 걸음이 길다. */
const STALL_MS = 70;

function readDistance(input: ReactiveInputEvent, ladder: number[]): number | null {
  const p = input.payload;
  if (typeof p !== 'object' || p === null) return null;
  const value = (p as { value?: unknown }).value;
  if (typeof value !== 'number') return null;
  return ladder.includes(value) ? value : null;
}

export async function prefetchingAlgorithm(ctxBase: FacetContext<PrefetchingData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<PrefetchingData>;
  const data = ctx.data;
  const ladder = data.distances;

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number) => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  /** 한 판을 재생한다. 끝까지 갔으면 true, 취소됐으면 false. */
  const playRound = async (distance: number): Promise<boolean> => {
    const result = computePrefetchingResult(data, distance);
    gauge('cycle-count', 0);
    gauge('stall-cycle-count', 0);
    gauge('miss-count', 0);
    gauge('wasted-count', 0);
    await ctx.emit({ type: 'round', payload: { distance } });
    if (!(await ctx.sleep(STEP_MS))) return false;

    let stall = 0;
    let miss = 0;
    let wasted = 0;
    for (const s of result.steps) {
      if (ctx.cancelled) return false;
      // 한 원소의 차례는 걸음 경계(sleep)로 나뉜다 — 코드 패널은 마지막 phase 를 켜 두므로,
      // 경계가 없으면 미스와 기다림 줄이 뒤따르는 'touch' 에 늘 덮여 한 번도 안 켜진다.
      //   [미스] → [기다림] → [쓰기 · 미리 부르기]   (미스 · 기다림이 없으면 그 걸음은 없다)
      if (s.miss) {
        // makeRoom 을 먼저 부르고 줄을 넣는다 — 내보냄이 있으면 그 줄이 켜진 채로 멈춘다
        await phase('miss');
        if (s.miss.evicted) {
          await phase('evict');
          if (s.miss.evicted.wasted) wasted += 1;
          await ctx.emit({
            type: 'evict',
            payload: { line: s.miss.evicted.line, slot: s.miss.evicted.slot, at: s.start, wasted: s.miss.evicted.wasted },
          });
        }
        miss += 1;
        await ctx.emit({
          type: 'fetch',
          payload: {
            i: s.i,
            line: s.miss.line,
            slot: s.miss.slot,
            kind: 'demand',
            issue: s.miss.issue,
            arrive: s.miss.arrive,
            stamp: s.miss.stamp,
          },
        });
        gauge('miss-count', miss);
        gauge('wasted-count', wasted);
        if (!(await ctx.sleep(MISS_MS))) return false;
      }
      if (s.stall > 0) {
        await phase('stall');
        stall += s.stall;
        await ctx.emit({
          type: 'wait',
          payload: { i: s.i, line: s.line, from: s.start, to: s.use, prefetched: s.waitedOnPrefetch },
        });
        gauge('cycle-count', s.use);
        gauge('stall-cycle-count', stall);
        if (!(await ctx.sleep(s.stall * STALL_MS))) return false;
      }
      await phase('touch');
      await ctx.emit({ type: 'touch', payload: { i: s.i, line: s.line, at: s.use, stamp: s.useStamp } });
      if (s.prefetch) {
        await phase('prefetch');
        if (s.prefetch.evicted) {
          // 내보냄이 있으면 makeRoom 줄이 켜진 채로 걸음이 끝난다
          await phase('evict');
          if (s.prefetch.evicted.wasted) wasted += 1;
          await ctx.emit({
            type: 'evict',
            payload: { line: s.prefetch.evicted.line, slot: s.prefetch.evicted.slot, at: s.use, wasted: s.prefetch.evicted.wasted },
          });
        }
        await ctx.emit({
          type: 'fetch',
          payload: {
            i: s.i,
            line: s.prefetch.line,
            slot: s.prefetch.slot,
            kind: 'prefetch',
            issue: s.prefetch.issue,
            arrive: s.prefetch.arrive,
            stamp: s.prefetch.stamp,
          },
        });
      }
      await ctx.emit({ type: 'tick', payload: { i: s.i, t: s.end } });
      gauge('cycle-count', s.end);
      gauge('stall-cycle-count', stall);
      gauge('miss-count', miss);
      gauge('wasted-count', wasted);
      if (!(await ctx.sleep(STEP_MS))) return false;
    }

    await phase('done');
    await ctx.emit({
      type: 'round-end',
      payload: { distance, cycles: result.cycles, stall: result.stall, miss: result.miss, wasted: result.wasted },
    });
    return true;
  };

  let distance = ladder.includes(data.distance) ? data.distance : ladder[0]!;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(distance))) return;
      // 판이 끝났다 — 손잡이를 기다린다. 우리 것이 아닌 입력은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'distance') continue;
        const next = readDistance(input, ladder);
        if (next === null) continue;
        distance = next;
        break;
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다.
    if (!ctx.cancelled) throw err;
  }
}
