/**
 * echo-and-reply — ping 은 번호를 단 요청을 찔러 보내고, 같은 식별자 · 같은 번호로
 * 돌아온 답과 짝을 맞춰 오간 시간을 잰다.
 *
 * 모형 (실제 ICMP 에코를 줄인 자리):
 * - 요청은 `intervalMs` 간격으로 보낸다. i 번째(0 부터) 요청을 보낸 시각은 `i × intervalMs`.
 * - 상대는 요청을 받는 즉시(처리 시간 0) type 만 답의 종류로 바꾸고 식별자 · seq 를 그대로 담아
 *   돌려보낸다.
 * - 왕복 시간 = 답을 받은 시각 − 그 seq 를 보낸 시각. 보낸 뒤 `timeoutMs` 안에 답이 없으면 잃은 것.
 * - 시각은 ms 정수이고 표시값이다 — 재생은 실제 ms 로 흐르지 않는다.
 * - 지연은 예로 정한 값이다. 도중에 사라진 요청은 `lost: 'request'` 로 적는다.
 *
 * 이벤트 (한 걸음 = seq 하나의 왕복 또는 기한 지남, 끝에 합계):
 *
 * - `echo` — 답이 돌아왔다. silent 아님.
 *   payload `{ seq: number; sentAt: number; reachedAt: number; receivedAt: number; rtt: number }`
 *   (`reachedAt` 은 상대가 요청을 받아 되돌린 시각)
 * - `lost` — 기한까지 답이 없었다. silent 아님.
 *   payload `{ seq: number; sentAt: number; deadlineAt: number }`
 * - `summary` — 보낸 것 · 받은 것 · 잃은 비율과 받은 것만의 최소 · 평균 · 최대. silent 아님.
 *   payload `{ sent: number; received: number; lossPercent: number; min: number; avg: number;
 *   max: number; minSeq: number; maxSeq: number }` — 동률이면 seq 가 앞선 쪽
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (두 끝과 빈 칸 넷).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 한 요청의 지연. 돌아오면 가는 · 오는 ms, 도중에 사라지면 `lost`. */
export type EchoProbe =
  | { seq: number; outMs: number; backMs: number }
  | { seq: number; lost: 'request' };

export type EchoAndReplyFacetData = {
  type: 'echo-and-reply';
  stepMs: number;
  /** 보내는 이의 주소 (자료, 번역하지 않는다) */
  source: string;
  /** 상대의 주소 */
  target: string;
  identifier: number;
  intervalMs: number;
  timeoutMs: number;
  /** ICMP 종류 번호 — 요청 · 답 */
  request: { type: number; code: number };
  reply: { type: number; code: number };
  probes: EchoProbe[];
};

export type EchoSummary = {
  sent: number;
  received: number;
  lossPercent: number;
  min: number;
  avg: number;
  max: number;
  minSeq: number;
  maxSeq: number;
};

/** 받은 왕복들에서 합계를 셈한다. 받은 것이 없으면 최소 · 평균 · 최대를 셀 수 없어 던진다. */
export function summarize(sent: number, rtts: ReadonlyArray<{ seq: number; rtt: number }>): EchoSummary {
  const first = rtts[0];
  if (first === undefined) throw new Error('echo-and-reply: 받은 답이 없어 최소 · 평균 · 최대를 셀 수 없다');
  let min = first;
  let max = first;
  let total = 0;
  for (const r of rtts) {
    total += r.rtt;
    if (r.rtt < min.rtt || (r.rtt === min.rtt && r.seq < min.seq)) min = r;
    if (r.rtt > max.rtt || (r.rtt === max.rtt && r.seq < max.seq)) max = r;
  }
  return {
    sent,
    received: rtts.length,
    lossPercent: ((sent - rtts.length) * 100) / sent,
    min: min.rtt,
    avg: total / rtts.length,
    max: max.rtt,
    minSeq: min.seq,
    maxSeq: max.seq,
  };
}

export async function echoAndReply(context: FacetContext<EchoAndReplyFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<EchoAndReplyFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  if (data.probes.length === 0) throw new Error('echo-and-reply: 보낼 요청이 없다');
  const rtts: Array<{ seq: number; rtt: number }> = [];

  // 걸음 0 은 두 끝과 빈 칸이 이미 선 화면이다 — 읽을 틈을 준 뒤 첫 요청을 보낸다.
  if (!(await pause())) return;

  for (let i = 0; i < data.probes.length; i += 1) {
    if (ctx.cancelled) return;
    const probe = data.probes[i];
    if (probe === undefined) throw new Error(`echo-and-reply: ${i} 번째 요청이 없다`);
    const sentAt = i * data.intervalMs;
    const deadlineAt = sentAt + data.timeoutMs;
    const nextSentAt = (i + 1) * data.intervalMs;

    if ('lost' in probe) {
      if (deadlineAt >= nextSentAt) {
        throw new Error(`echo-and-reply: seq ${probe.seq} 의 기한이 다음 요청과 겹친다 — 이 모형은 겹침을 다루지 않는다`);
      }
      await ctx.emit({ type: 'lost', payload: { seq: probe.seq, sentAt, deadlineAt } });
    } else {
      const reachedAt = sentAt + probe.outMs;
      const receivedAt = reachedAt + probe.backMs;
      const rtt = receivedAt - sentAt;
      if (probe.outMs <= 0 || probe.backMs <= 0) {
        throw new Error(`echo-and-reply: seq ${probe.seq} 의 지연이 0 이하다`);
      }
      if (rtt > data.timeoutMs) {
        throw new Error(`echo-and-reply: seq ${probe.seq} 의 답이 기한 뒤에 온다 — 이 모형은 늦은 답을 다루지 않는다`);
      }
      if (receivedAt >= nextSentAt) {
        throw new Error(`echo-and-reply: seq ${probe.seq} 의 답이 다음 요청과 겹친다`);
      }
      rtts.push({ seq: probe.seq, rtt });
      await ctx.emit({ type: 'echo', payload: { seq: probe.seq, sentAt, reachedAt, receivedAt, rtt } });
    }

    if (!(await pause())) return;
  }

  const summary = summarize(data.probes.length, rtts);
  await ctx.emit({ type: 'summary', payload: summary });
}
