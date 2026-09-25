/**
 * congestion-control — 흐름 제어와 혼잡 제어.
 *
 * 왕복마다 보냄 = min(혼잡 창, 받는 창). 받는 창 = 버퍼 − 안 읽은 조각. 앱이 왕복마다
 * readRate 만큼(있는 만큼만) 읽고, 한 왕복에 capacity 를 넘게 보내면 그 왕복은 잃는다.
 * 창 · 버퍼 · 확인은 모두 조각 수로 센다. 한 걸음 = 한 왕복.
 *
 * ## 한 왕복 안의 차례 (사양 · sim.py `run_rounds` 와 같다)
 *   ① window = buffer − unread (음수면 던진다) · send = min(cwnd, window)
 *   ② send > capacity 이면 잃음 — 전달 = capacity, ssthresh = ⌊send / 2⌋ (1 보다 작으면 던진다),
 *      cwnd = ssthresh, acked = 0.
 *      아니면 전달 = send. 받는 창이 조이지 않은 왕복(window ≥ cwnd, 곧 send = cwnd)에서만
 *      확인 하나마다 창이 자란다: cwnd < ssthresh → cwnd + 1 / 아니면 acked + 1,
 *      acked ≥ cwnd 이면 acked − cwnd · cwnd + 1. 정수만 쓴다
 *   ③ unread += 전달 (buffer 를 넘으면 던진다) · 앱이 min(unread, readRate) 를 읽는다
 *
 * 왕복의 종류 — 'loss'(잃음) · 'receiver'(window < cwnd, 잃지 않음) · 'slow-start'(왕복 머리의
 * cwnd < ssthresh) · 'avoid'(나머지). 한 왕복 안에서 슬로 스타트와 혼잡 회피가 섞이거나
 * 받는 창에 조이면서 잃으면 phase 하나로 가를 수 없으므로 던진다.
 * 동률: window = cwnd 이면 받는 창이 조이지 않은 것으로 본다(혼잡 창이 보냄을 정한다).
 *
 * ## 이벤트
 * - `phase` (silent) `{ phase }` — 왕복마다 그 종류의 phase 하나. 판 머리에는 없다
 * - `run-start` `{ readRate, capacity, buffer, rounds, cwnd, ssthresh, window }` — 판 머리(왕복 0).
 *   cwnd · ssthresh 는 처음 값, window 는 빈 버퍼의 받는 창
 * - `round` `{ round, cwnd, ssthresh, window, send, delivered, kind, limiter, nextCwnd,
 *   unreadBefore, unreadFilled, read, unread, deliveredTotal, lossRounds, receiverLimitedRounds }`
 *   round 는 1 부터. cwnd · ssthresh · window 는 왕복 머리의 값, ssthresh 는 이 왕복 뒤의 값을
 *   `nextSsthresh` 로 따로 싣는다. limiter 는 'receiver'(window < cwnd) 또는 'network'.
 *   unreadBefore → unreadFilled(전달 뒤) → unread(앱이 읽은 뒤)
 *
 * ## phase 어휘 (irs.ts 와 같다)
 * `slow-start-grow` · `avoid-grow` · `receiver-clamp` · `halve-on-loss`
 *
 * ## 계기
 * `delivered-total` 전달 합 · `loss-rounds` 잃은 왕복 수 · `receiver-limited-rounds` 받는 창이 조인
 * 왕복 수. 판 머리에서 0 으로 되돌리고 왕복마다 차이만 보낸다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CongestionControlData = {
  type: 'congestion-control';
  stepMs: number;
  buffer: number;
  cwnd0: number;
  ssthresh0: number;
  rounds: number;
  readRate: number;
  capacity: number;
  readLadder: number[];
  capacityLadder: number[];
};

export type RoundKind = 'slow-start' | 'avoid' | 'receiver' | 'loss';

export type RoundRow = {
  round: number;
  cwnd: number;
  ssthresh: number;
  nextSsthresh: number;
  window: number;
  send: number;
  delivered: number;
  kind: RoundKind;
  limiter: 'receiver' | 'network';
  nextCwnd: number;
  unreadBefore: number;
  unreadFilled: number;
  read: number;
  unread: number;
};

/** 왕복 반복 전체를 셈한다. IR 의 runRounds 와 같은 셈이다. */
export function runRounds(
  rounds: number,
  readRate: number,
  capacity: number,
  buffer: number,
  cwnd0: number,
  ssthresh0: number,
): RoundRow[] {
  let cwnd = cwnd0;
  let ssthresh = ssthresh0;
  let acked = 0;
  let unread = 0;
  const rows: RoundRow[] = [];
  for (let rd = 1; rd <= rounds; rd++) {
    const window = buffer - unread;
    if (window < 0) throw new Error(`왕복 ${rd}: 받는 창이 음수다 (${window})`);
    const send = Math.min(cwnd, window);
    const cwndBefore = cwnd;
    const ssthBefore = ssthresh;
    const clamped = window < cwnd;
    let kind: RoundKind;
    let delivered: number;
    if (send > capacity) {
      if (clamped) throw new Error(`왕복 ${rd}: 받는 창에 조이면서 잃는다 — phase 하나로 못 가른다`);
      kind = 'loss';
      delivered = capacity;
      ssthresh = Math.floor(send / 2);
      if (ssthresh < 1) throw new Error(`왕복 ${rd}: 문턱이 1 보다 작다`);
      cwnd = ssthresh;
      acked = 0;
    } else {
      delivered = send;
      if (clamped) kind = 'receiver';
      else if (cwnd < ssthresh) kind = 'slow-start';
      else kind = 'avoid';
      if (send === cwnd) {
        let grewSlow = false;
        let grewAvoid = false;
        for (let k = 0; k < send; k++) {
          if (cwnd < ssthresh) {
            cwnd += 1;
            grewSlow = true;
          } else {
            acked += 1;
            grewAvoid = true;
            if (acked >= cwnd) {
              acked -= cwnd;
              cwnd += 1;
            }
          }
        }
        if (grewSlow && grewAvoid) {
          throw new Error(`왕복 ${rd}: 슬로 스타트와 혼잡 회피가 섞인다 — phase 하나로 못 가른다`);
        }
      }
    }
    const unreadBefore = unread;
    unread += delivered;
    if (unread > buffer) throw new Error(`왕복 ${rd}: 버퍼 넘침 (${unread} > ${buffer})`);
    const unreadFilled = unread;
    const read = Math.min(unread, readRate);
    unread -= read;
    rows.push({
      round: rd,
      cwnd: cwndBefore,
      ssthresh: ssthBefore,
      nextSsthresh: ssthresh,
      window,
      send,
      delivered,
      kind,
      limiter: clamped ? 'receiver' : 'network',
      nextCwnd: cwnd,
      unreadBefore,
      unreadFilled,
      read,
      unread,
    });
  }
  return rows;
}

function checkData(d: CongestionControlData): void {
  if (d.type !== 'congestion-control') throw new Error(`모르는 자료 type: ${String(d.type)}`);
  for (const [name, v] of [
    ['buffer', d.buffer],
    ['cwnd0', d.cwnd0],
    ['ssthresh0', d.ssthresh0],
    ['rounds', d.rounds],
  ] as const) {
    if (!Number.isInteger(v) || v < 1) throw new Error(`${name} 가 1 이상의 정수가 아니다: ${v}`);
  }
  if (!d.readLadder.includes(d.readRate)) throw new Error(`readRate ${d.readRate} 가 사다리 밖이다`);
  if (!d.capacityLadder.includes(d.capacity)) throw new Error(`capacity ${d.capacity} 가 사다리 밖이다`);
}

type MetricName = 'delivered-total' | 'loss-rounds' | 'receiver-limited-rounds';

export async function congestionControlAlgorithm(
  base: FacetContext<CongestionControlData>,
): Promise<void> {
  const ctx = base as ReactiveContext<CongestionControlData>;
  const d = ctx.data;
  checkData(d);

  const shown: Record<MetricName, number> = {
    'delivered-total': 0,
    'loss-rounds': 0,
    'receiver-limited-rounds': 0,
  };
  const showMetric = (name: MetricName, value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let readRate = d.readRate;
  let capacity = d.capacity;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const rows = runRounds(d.rounds, readRate, capacity, d.buffer, d.cwnd0, d.ssthresh0);

      // 판 머리 — 왕복 0
      showMetric('delivered-total', 0);
      showMetric('loss-rounds', 0);
      showMetric('receiver-limited-rounds', 0);
      await ctx.emit({
        type: 'run-start',
        payload: {
          readRate,
          capacity,
          buffer: d.buffer,
          rounds: d.rounds,
          cwnd: d.cwnd0,
          ssthresh: d.ssthresh0,
          window: d.buffer,
        },
      });
      if (!(await ctx.sleep(d.stepMs))) return;

      let deliveredTotal = 0;
      let lossRounds = 0;
      let receiverLimitedRounds = 0;
      for (const row of rows) {
        if (ctx.cancelled) return;
        deliveredTotal += row.delivered;
        if (row.kind === 'loss') lossRounds += 1;
        if (row.kind === 'receiver') receiverLimitedRounds += 1;

        if (row.kind === 'slow-start') await phase('slow-start-grow');
        else if (row.kind === 'avoid') await phase('avoid-grow');
        else if (row.kind === 'receiver') await phase('receiver-clamp');
        else await phase('halve-on-loss');

        showMetric('delivered-total', deliveredTotal);
        showMetric('loss-rounds', lossRounds);
        showMetric('receiver-limited-rounds', receiverLimitedRounds);
        await ctx.emit({
          type: 'round',
          payload: { ...row, deliveredTotal, lossRounds, receiverLimitedRounds },
        });
        if (!(await ctx.sleep(d.stepMs))) return;
      }

      // 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'readRate' && input.type !== 'capacity') continue;
        const payload = input.payload;
        const value =
          typeof payload === 'object' && payload !== null
            ? (payload as { value?: unknown }).value
            : undefined;
        if (typeof value !== 'number') {
          throw new Error(`손잡이 ${input.type} 의 값이 수가 아니다: ${String(value)}`);
        }
        if (input.type === 'readRate') {
          if (!d.readLadder.includes(value)) throw new Error(`readRate ${value} 가 사다리 밖이다`);
          readRate = value;
        } else {
          if (!d.capacityLadder.includes(value)) throw new Error(`capacity ${value} 가 사다리 밖이다`);
          capacity = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
