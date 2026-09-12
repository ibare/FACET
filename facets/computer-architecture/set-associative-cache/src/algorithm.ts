/**
 * 집합 연관 캐시 — 칸 수를 늘리지 않고도 미스를 줄인다.
 *
 * 칸은 여덟으로 고정이다. 달라지는 것은 그 여덟을 몇 개씩 묶느냐뿐이고, 묶음이
 * 넓어지면 같은 자리를 노리던 주소들이 서로 밀어내는 대신 곁에 앉는다. 다만
 * 공짜가 아니다 — 한 번 찾을 때 한 자리가 아니라 묶음 전체를 뒤져야 하고,
 * 서로 다른 줄이 다섯뿐이라 4-way 위로는 더 올려도 나아지지 않는다.
 *
 * ── 식별자
 *   index:<i>   접근열의 i 번째 주소 칩
 *
 * ── 이벤트 (✱ 는 facet 고유)
 *   phase           { phase: string }                                   silent ✱
 *   layout-changed  { ways, sets, slots }                                      ✱
 *   highlight       { round, addr, line, setIndex, tag }   target 'index:<i>'
 *   probe-set       { setIndex, ways }                                         ✱
 *   cache-hit       { slot, setIndex, tag }                                    ✱
 *   cache-miss      { slot, setIndex, tag, evictedTag: number | null }         ✱
 *   done            { ways, misses, prevWays: number | null,
 *                     prevMisses: number | null }
 *
 * ── phase 어휘 (C3 — irs.ts 의 phase 집합과 정확히 같다)
 *   'sets' | 'decode' | 'probe' | 'count' | 'evict' | 'fill' | 'touch' | 'done'
 *
 * ── 메트릭 (C5)
 *   miss-count    지금까지의 미스 수
 *   probe-width   한 번 찾을 때 뒤지는 칸 수 (= 연관도)
 *
 * ── 조작
 *   `ways` 액션(segmented-slider) 하나. 판이 도는 도중에 들어오면 그 자리에서
 *   멈추고 새 연관도로 다시 시작한다. 그래서 이 facet 은 reactive 다 —
 *   등록 옵션은 `index.ts` 에 있다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type SetAssociativeCacheData = {
  type: string;
  /** 전체 칸 수. 연관도를 올려도 이 수는 변하지 않는다 — 그것이 이 화면의 주장이다. */
  slots: number;
  /** 한 줄이 덮는 바이트 수. 줄 번호는 주소를 이 수로 나눈 몫이다. */
  lineBytes: number;
  /** 손잡이가 오갈 수 있는 연관도. */
  waysLadder: number[];
  /** 시작 연관도. */
  ways: number;
  /** 접근열의 주소들. */
  addresses: number[];
  /** 접근열을 몇 바퀴 도는가. */
  rounds: number;
  /** 걸음 사이의 기본 간격 (ms). 속도 슬라이더가 이 값을 나눈다. */
  stepMs: number;
};

/** 아직 아무도 앉지 않은 칸의 태그. 태그는 늘 0 이상이라 겹치지 않는다. */
const EMPTY = -1;

/**
 * 한 묶음 안을 처음부터 끝까지 훑어 태그를 찾는다. 없으면 -1.
 *
 * 순수 헬퍼다 — ctx 를 받지 않으므로 C8 의 루프 규율 대상이 아니고, irs.ts 의
 * `findWay` 와 문장 단위로 같은 것을 한다.
 */
function findWay(tags: number[], first: number, ways: number, tag: number): number {
  for (let w = 0; w < ways; w += 1) {
    if (tags[first + w] === tag) return w;
  }
  return -1;
}

/**
 * 밀어낼 칸 — 가장 오래 안 쓰인 것 (LRU).
 *
 * 빈 칸의 시각은 0 이라 언제나 최솟값이다. 그래서 빈 자리를 따로 묻지 않아도
 * 빈 자리가 먼저 골라진다 (irs.ts 의 `victimWay` 와 같은 짜임).
 */
function victimWay(stamps: number[], first: number, ways: number): number {
  let oldest = stamps[first];
  for (let w = 1; w < ways; w += 1) {
    oldest = Math.min(oldest, stamps[first + w]);
  }
  for (let w = 0; w < ways; w += 1) {
    if (stamps[first + w] === oldest) return w;
  }
  return 0;
}

/**
 * 한 연관도로 접근열을 끝까지 돌았을 때의 미스 수.
 *
 * 화면과 무관한 순수 함수다. 판이 끝났을 때 "한 칸 아래 연관도에서는 몇이었나"
 * 를 말하려면 그 수가 필요한데, 그것을 이야기로 지어내지 않고 여기서 실제로
 * 센다. 같은 셈이 IR 에도 있고, 검사가 둘을 네 연관도 전부에서 맞댄다.
 */
export function countSetAssociativeMisses(
  data: SetAssociativeCacheData,
  ways: number,
): number {
  const sets = Math.floor(data.slots / ways);
  const tags = new Array<number>(data.slots).fill(EMPTY);
  const stamps = new Array<number>(data.slots).fill(0);
  let clock = 0;
  let misses = 0;
  for (let round = 0; round < data.rounds; round += 1) {
    for (let i = 0; i < data.addresses.length; i += 1) {
      clock += 1;
      const line = Math.floor(data.addresses[i] / data.lineBytes);
      const si = line % sets;
      const tg = Math.floor(line / sets);
      const first = si * ways;
      let w = findWay(tags, first, ways, tg);
      if (w < 0) {
        misses += 1;
        w = victimWay(stamps, first, ways);
        tags[first + w] = tg;
      }
      stamps[first + w] = clock;
    }
  }
  return misses;
}

/** 한 판이 어떻게 끝났는가. 취소와 갈림을 boolean 하나로 겹치지 않는다 (C8). */
type PassOutcome = 'cancelled' | 'restart' | 'done';

export const setAssociativeCacheAlgorithm = async (
  ctx: FacetContext<SetAssociativeCacheData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<SetAssociativeCacheData>;
  const data = ctx.data;
  const slots = data.slots;
  const ladder = data.waysLadder;
  const tags = new Array<number>(slots).fill(EMPTY);
  const stamps = new Array<number>(slots).fill(0);
  let ways = ladder.includes(data.ways) ? data.ways : ladder[0];

  /**
   * 계기에 값을 **놓는다**. `ctx.metric` 은 차이를 더하는 것이라, 절대값을
   * 보이려면 지금 보이는 값과의 차이를 보내야 한다. 이름은 호출부에 리터럴로
   * 남으므로 C5 의 취지가 지켜진다.
   */
  const shownMetrics = new Map<string, number>();
  const show = (name: string, value: number): void => {
    ctx.metric(name, value - (shownMetrics.get(name) ?? 0));
    shownMetrics.set(name, value);
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 손잡이가 보낸 연관도. 우리 사다리에 있는 수일 때만 받는다. */
  const readWays = (input: ReactiveInputEvent): number | null => {
    if (input.type !== 'ways') return null;
    const payload = input.payload as { value?: unknown } | undefined;
    const value = payload?.value;
    if (typeof value !== 'number') return null;
    return ladder.includes(value) ? value : null;
  };

  /**
   * 큐에 쌓인 입력을 비우며 연관도 변경이 있었는지 본다. 기다리지 않는다.
   * 큐가 비면 `pollInput` 이 null 을 주므로 이 루프는 반드시 끝난다 (취소된
   * 뒤에도 null 이다).
   */
  const takeWays = (): boolean => {
    for (;;) {
      const input = rc.pollInput();
      if (input === null) return false;
      const next = readWays(input);
      if (next !== null) {
        ways = next;
        return true;
      }
    }
  };

  /** 다음 연관도 변경을 기다린다. 끝까지 기다렸으면 true, 취소됐으면 false. */
  const waitWays = async (): Promise<boolean> => {
    for (;;) {
      if (ctx.cancelled) return false;
      let input: ReactiveInputEvent;
      try {
        input = await rc.waitForInput();
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
        // 올려 러너가 드러내게 둔다.
        if (!ctx.cancelled) throw err;
        return false;
      }
      if (ctx.cancelled) return false;
      const next = readWays(input);
      if (next === null) continue;
      ways = next;
      return true;
    }
  };

  const runPass = async (): Promise<PassOutcome> => {
    const sets = Math.floor(slots / ways);
    tags.fill(EMPTY);
    stamps.fill(0);
    await phase('sets');
    await ctx.emit({ type: 'layout-changed', payload: { ways, sets, slots } });
    show('probe-width', ways);
    show('miss-count', 0);

    let clock = 0;
    let misses = 0;
    for (let round = 0; round < data.rounds; round += 1) {
      if (ctx.cancelled) return 'cancelled';
      for (let i = 0; i < data.addresses.length; i += 1) {
        if (ctx.cancelled) return 'cancelled';
        if (takeWays()) return 'restart';

        clock += 1;
        const addr = data.addresses[i];
        const line = Math.floor(addr / data.lineBytes);
        const si = line % sets;
        const tg = Math.floor(line / sets);
        await phase('decode');
        await ctx.emit({
          type: 'highlight',
          target: `index:${i}`,
          payload: { round, addr, line, setIndex: si, tag: tg },
        });

        await phase('probe');
        await ctx.emit({ type: 'probe-set', payload: { setIndex: si, ways } });
        if (!(await rc.sleep(data.stepMs))) return 'cancelled';

        const first = si * ways;
        let w = findWay(tags, first, ways, tg);
        if (w >= 0) {
          await ctx.emit({ type: 'cache-hit', payload: { slot: first + w, setIndex: si, tag: tg } });
        } else {
          await phase('count');
          misses += 1;
          show('miss-count', misses);
          await phase('evict');
          w = victimWay(stamps, first, ways);
          const resident = tags[first + w];
          await phase('fill');
          tags[first + w] = tg;
          await ctx.emit({
            type: 'cache-miss',
            payload: {
              slot: first + w,
              setIndex: si,
              tag: tg,
              evictedTag: resident === EMPTY ? null : resident,
            },
          });
        }

        await phase('touch');
        stamps[first + w] = clock;
        if (!(await rc.sleep(data.stepMs))) return 'cancelled';
      }
    }

    const rung = ladder.indexOf(ways);
    const prevWays = rung > 0 ? ladder[rung - 1] : null;
    await phase('done');
    await ctx.emit({
      type: 'done',
      payload: {
        ways,
        misses,
        prevWays,
        prevMisses: prevWays === null ? null : countSetAssociativeMisses(data, prevWays),
      },
    });
    return 'done';
  };

  for (;;) {
    if (ctx.cancelled) return;
    const outcome = await runPass();
    if (outcome === 'cancelled') return;
    if (outcome === 'restart') continue;
    if (!(await waitWays())) return;
  }
};
