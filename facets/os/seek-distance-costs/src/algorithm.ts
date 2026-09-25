/**
 * seek-distance-costs — 팔이 옮겨 간 만큼 요청의 시간이 늘어난다.
 *
 * 요청은 온 차례 그대로 처리한다 (고르지 않는다). 요청 하나마다 팔이 그 요청의
 * 실린더로 옮겨 가고, 옮겨 간 거리 × msPerCylinder 가 탐색 시간, 거기에 요청마다
 * 같은 고정분(회전 대기 + 전송) fixedMs 가 붙는다. 반올림은 하지 않는다 — 표시할 때만.
 *
 * 이벤트
 *   serve  (걸음) 요청 하나를 처리했다.
 *     payload: {
 *       index: number       요청의 온 차례 (0 부터)
 *       from: number        옮겨 가기 전 팔의 실린더
 *       to: number          요청의 실린더 (처리 뒤 팔의 자리)
 *       distance: number    |to − from|
 *       seekMs: number      distance × msPerCylinder
 *       totalMs: number     seekMs + fixedMs
 *       sameAs: number[]    앞서 처리한 요청 가운데 거리가 같은 것의 index (거리가 같으면 시간도 같다)
 *       sumDistance: number · sumSeekMs: number · sumFixedMs: number · sumTotalMs: number   지금까지의 합
 *     }
 *
 * silent 이벤트는 없다. 걸음 0 은 장면의 initial 이 initialData 에서 채운다 (팔 · 요청 줄).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SeekDistanceCostsFacetData = {
  type: 'seek-distance-costs';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 실린더 개수 — 번호는 0..cylinders-1 */
  cylinders: number;
  /** 팔의 처음 실린더 */
  start: number;
  /** 온 차례대로의 요청 실린더 */
  requests: number[];
  /** 실린더 하나를 옮겨 가는 데 드는 ms (선형 모형) */
  msPerCylinder: number;
  /** 요청마다 같은 고정분 — 회전 대기 + 전송 (ms) */
  fixedMs: number;
};

/** 자료가 셈할 수 있는 모양인지 본다. 아니면 무엇이 틀렸는지 담아 던진다. */
export function checkSeekData(data: SeekDistanceCostsFacetData): void {
  const { cylinders, start, requests, msPerCylinder, fixedMs } = data;
  if (!Number.isInteger(cylinders) || cylinders < 2) {
    throw new Error(`seek-distance-costs: 실린더 개수가 옳지 않다 (${String(cylinders)})`);
  }
  const inRange = (c: number): boolean => Number.isInteger(c) && c >= 0 && c < cylinders;
  if (!inRange(start)) throw new Error(`seek-distance-costs: 팔의 처음 자리가 범위 밖이다 (${String(start)})`);
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error('seek-distance-costs: 요청이 없다');
  }
  requests.forEach((r, i) => {
    if (!inRange(r)) throw new Error(`seek-distance-costs: 요청 ${i} 의 실린더가 범위 밖이다 (${String(r)})`);
  });
  if (!(msPerCylinder > 0) || !(fixedMs >= 0)) {
    throw new Error('seek-distance-costs: 탐색 · 고정분 ms 가 옳지 않다');
  }
}

export async function seekDistanceCosts(
  context: FacetContext<SeekDistanceCostsFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<SeekDistanceCostsFacetData>;
  const data = ctx.data;
  checkSeekData(data);
  const { stepMs, requests, msPerCylinder, fixedMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let arm = data.start;
  const distances: number[] = [];
  let sumDistance = 0;
  let sumSeekMs = 0;
  let sumFixedMs = 0;
  let sumTotalMs = 0;

  for (let index = 0; index < requests.length; index += 1) {
    // 걸음 0 은 팔과 요청 줄이 이미 읽을 것이라 첫 요청 앞에도 머문다.
    if (!(await pause())) return;
    const to = requests[index];
    if (to === undefined) throw new Error(`seek-distance-costs: 요청 ${index} 이 비었다`);
    const from = arm;
    const distance = Math.abs(to - from);
    const seekMs = distance * msPerCylinder;
    const totalMs = seekMs + fixedMs;
    const sameAs: number[] = [];
    distances.forEach((d, i) => {
      if (d === distance) sameAs.push(i);
    });
    distances.push(distance);
    sumDistance += distance;
    sumSeekMs += seekMs;
    sumFixedMs += fixedMs;
    sumTotalMs += totalMs;
    arm = to;
    await ctx.emit({
      type: 'serve',
      payload: {
        index,
        from,
        to,
        distance,
        seekMs,
        totalMs,
        sameAs,
        sumDistance,
        sumSeekMs,
        sumFixedMs,
        sumTotalMs,
      },
    });
  }
}
