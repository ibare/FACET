/**
 * back-off-on-loss — 같은 확인 번호가 셋째 되풀이되는 순간 보내는 쪽 창이 반으로 꺾인다.
 *
 * 모형 (시작 번호 · 창 · 문턱 · 잃는 자리 · 도착 묶음은 모두 예로 정한 값이다. 실제 TCP 의
 * 시작 번호는 무작위다):
 *   - 조각 번호로 센다 (실제 TCP 는 바이트 번호). 창 · 문턱도 조각 수다.
 *   - 확인 번호 = 다음에 기대하는 조각 번호 (누적).
 *   - 중복 확인 = 바로 앞에 돌려보낸 것과 같은 확인 번호.
 *   - 중복이 `dupThreshold`(셋) 째가 되는 순간: 문턱 = ⌊창 / 2⌋, 창 = 문턱, 잃은 조각을 다시 보낸다.
 *     한 번만 — 그 뒤의 중복은 창을 바꾸지 않는다 (빠른 회복의 창 부풀리기는 줄였다).
 *   - 다시 보낸 조각이 닿으면 쥐고 있던 것을 넘어 확인 번호가 나아간다.
 *   - 마지막 걸음: 새 창으로 다음 왕복을 보내고 모두 확인된다. 창 ≥ 문턱이므로 혼잡 회피대로 창 + 1.
 *   - 한 걸음 = 도착 묶음 하나 (첫 걸음은 보냄). 한 묶음 안에서는 적힌 차례대로.
 *
 * 이벤트 (모두 silent 아님):
 *   send   { segments: number[]; lost: number; cwnd: number; ssthresh: number }
 *          — 창만큼 보낸다. `lost` 는 길에서 사라진다.
 *   arrive { arrivals: { segment: number; ack: number; dup: number }[];
 *            was: number; thWas: number; cwnd: number; ssthresh: number;
 *            resent: number | null }
 *          — 도착 묶음 하나. `dup` 은 그 확인이 몇째 중복인지 (0 이면 새 번호).
 *            `was` · `thWas` 는 이 걸음 앞의 창 · 문턱. `resent` 는 이 걸음에 다시 보낸 조각.
 *   round  { segments: number[]; ack: number; was: number; cwnd: number; ssthresh: number }
 *          — 다음 왕복을 새 창으로 보내 모두 확인된다.
 *
 * 셈할 수 없는 자료(보내지 않은 조각의 도착 · 두 번 도착 · 잃은 조각이 다시 나가지 않았는데 닿음 ·
 * 혼잡 회피가 아닌 처음 상태)는 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BackOffOnLossFacetData = {
  type: 'back-off-on-loss';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 처음 혼잡 창 (조각 수) */
  cwnd: number;
  /** 처음 문턱 (조각 수) */
  ssthresh: number;
  /** 첫 조각 번호 */
  first: number;
  /** 길에서 사라지는 조각 번호 */
  lost: number;
  /** 걸음마다 닿는 조각 묶음 (다시 보낸 조각 제외) */
  arrivals: number[][];
  /** 몇째 중복에서 다시 보내는가 */
  dupThreshold: number;
  /** 확인의 프로토콜 글자 (번역하지 않는 자료) */
  ackGlyph: string;
};

type Arrival = { segment: number; ack: number; dup: number };

function range(from: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) out.push(from + i);
  return out;
}

export async function backOffOnLoss(
  context: FacetContext<BackOffOnLossFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<BackOffOnLossFacetData>;
  const { stepMs, first, lost, arrivals, dupThreshold } = ctx.data;
  let cwnd = ctx.data.cwnd;
  let ssthresh = ctx.data.ssthresh;

  if (cwnd < ssthresh) throw new Error(`처음 창 ${cwnd} 이 문턱 ${ssthresh} 보다 작다 — 혼잡 회피 중이 아니다`);

  const segments = range(first, cwnd);
  if (!segments.includes(lost)) throw new Error(`잃는 조각 ${lost} 은 보낸 조각이 아니다`);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 에 창 · 문턱이 이미 서 있으므로 읽을 틈을 둔다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'send', payload: { segments, lost, cwnd, ssthresh } });

  const got = new Set<number>();
  let expect = first;
  let lastAck: number | null = null;
  let dup = 0;
  let halved = false;

  function take(segment: number): Arrival {
    if (!segments.includes(segment)) throw new Error(`보내지 않은 조각 ${segment} 이 닿았다`);
    if (got.has(segment)) throw new Error(`조각 ${segment} 이 두 번 닿았다`);
    got.add(segment);
    while (got.has(expect)) expect += 1;
    dup = lastAck !== null && expect === lastAck ? dup + 1 : 0;
    lastAck = expect;
    return { segment, ack: expect, dup };
  }

  for (const group of arrivals) {
    if (!(await pause())) return;
    const was = cwnd;
    const thWas = ssthresh;
    let resent: number | null = null;
    const acks: Arrival[] = [];
    for (const segment of group) {
      if (ctx.cancelled) return;
      if (segment === lost) throw new Error(`잃은 조각 ${lost} 이 도착 묶음에 있다`);
      const arrival = take(segment);
      acks.push(arrival);
      if (arrival.dup === dupThreshold && !halved) {
        ssthresh = Math.floor(cwnd / 2);
        cwnd = ssthresh;
        halved = true;
        resent = lost;
      }
    }
    await ctx.emit({
      type: 'arrive',
      payload: { arrivals: acks, was, thWas, cwnd, ssthresh, resent },
    });
  }

  if (!halved) throw new Error(`중복이 ${dupThreshold} 째에 이르지 않아 ${lost} 을 다시 보내지 않았다`);

  // 다시 보낸 조각이 닿는다.
  if (!(await pause())) return;
  {
    const was = cwnd;
    const thWas = ssthresh;
    const arrival = take(lost);
    await ctx.emit({
      type: 'arrive',
      payload: { arrivals: [arrival], was, thWas, cwnd, ssthresh, resent: null },
    });
  }
  if (got.size !== segments.length) throw new Error('보낸 조각 가운데 닿지 않은 것이 있다');

  // 다음 왕복 — 새 창만큼 보내고 모두 확인된다.
  if (!(await pause())) return;
  if (cwnd < ssthresh) throw new Error(`창 ${cwnd} 이 문턱 ${ssthresh} 보다 작다 — 이 조각은 혼잡 회피만 다룬다`);
  const next = range(expect, cwnd);
  const was = cwnd;
  cwnd += 1;
  await ctx.emit({
    type: 'round',
    payload: { segments: next, ack: expect + next.length, was, cwnd, ssthresh },
  });
}
