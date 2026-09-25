/**
 * send-and-forget — UDP 는 보내고 확인하지 않는다.
 *
 * 보내는 쪽은 틱 i 에 데이터그램 i 를 내보내고 그것으로 끝이다. 길 위의 지연(틱)이
 * 데이터그램마다 다르고, 하나는 길에서 사라진다. 받는 쪽 앱은 닿은 차례 그대로 받는다.
 *
 * 모형 (예로 정한 값 — 지연 · 사라지는 자리 모두 데이터가 정한다. 무작위 없음)
 * - 시간은 틱으로만 흐른다. 한 걸음 = 한 틱
 * - 틱 i (1 부터) 에 데이터그램 i 를 보낸다
 * - 도착 틱 = 보낸 틱 + 지연. 지연이 `null` 이면 길에서 사라진다
 * - 같은 틱이면 도착이 먼저, 보냄이 나중. 같은 틱에 둘이 닿으면 번호 차례
 * - 확인 · 재전송 · 순서 맞추기 · 연결 열기 없음. 앱은 닿는 즉시 받는다
 * - 마지막 도착 틱에서 끝난다
 *
 * 이벤트
 * - `init` (silent) — payload `{ datagrams: { name: string; sendTick: number; arriveTick: number | null }[] }`
 *   알고리즘이 셈한 보낸 틱 · 도착 틱. 걸음 0 의 바탕을 채운다
 * - `tick` — payload `{ tick: number; arrived: { index: number; after: number[] }[];
 *   sent: number | null; lost: boolean; last: boolean }`
 *   - `arrived` 이 틱에 앱에 닿은 데이터그램 (번호 차례). `after` 는 이미 앱에 닿은 것 가운데
 *     그것보다 뒤에 보낸 것의 번호 — 순서가 뒤바뀐 자리
 *   - `sent` 이 틱에 보낸 데이터그램 번호 (없으면 null), `lost` 그것이 길에서 사라지는가
 *   - `last` 마지막 도착 틱인가
 *
 * 번호(index)는 `datagrams` 배열의 0 부터 센 자리다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SendAndForgetDatagram = {
  /** 데이터그램 이름 — 식별자이자 화면 글자 (자료, 번역하지 않는다) */
  name: string;
  /** 길 위의 지연 (틱). null 이면 길에서 사라진다 */
  delay: number | null;
};

export type SendAndForgetFacetData = {
  type: 'send-and-forget';
  stepMs: number;
  /** 보내는 쪽 주소:포트 (자료) */
  sender: string;
  /** 받는 쪽 주소:포트 (자료) */
  receiver: string;
  datagrams: SendAndForgetDatagram[];
};

export type PlannedDatagram = {
  name: string;
  sendTick: number;
  arriveTick: number | null;
};

/** 데이터에서 보낸 틱 · 도착 틱을 셈한다. 셈할 수 없는 데이터는 던진다. */
export function planSendAndForget(data: SendAndForgetFacetData): PlannedDatagram[] {
  if (!Array.isArray(data.datagrams) || data.datagrams.length === 0) {
    throw new Error('send-and-forget: 데이터그램이 없다');
  }
  const seen = new Set<string>();
  return data.datagrams.map((d, i) => {
    if (typeof d.name !== 'string' || d.name === '') {
      throw new Error(`send-and-forget: ${i} 번째 데이터그램에 이름이 없다`);
    }
    if (seen.has(d.name)) throw new Error(`send-and-forget: 이름 ${d.name} 이 겹친다`);
    seen.add(d.name);
    const sendTick = i + 1;
    if (d.delay === null) return { name: d.name, sendTick, arriveTick: null };
    if (!Number.isInteger(d.delay) || d.delay < 1) {
      throw new Error(`send-and-forget: ${d.name} 의 지연이 1 이상의 정수가 아니다 (${String(d.delay)})`);
    }
    return { name: d.name, sendTick, arriveTick: sendTick + d.delay };
  });
}

export async function sendAndForget(context: FacetContext<SendAndForgetFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<SendAndForgetFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  if (!Number.isFinite(stepMs) || stepMs <= 0) {
    throw new Error(`send-and-forget: stepMs 가 양수가 아니다 (${String(stepMs)})`);
  }
  const plan = planSendAndForget(data);
  const arrivals = plan.flatMap((d) => (d.arriveTick === null ? [] : [d.arriveTick]));
  if (arrivals.length === 0) throw new Error('send-and-forget: 닿는 데이터그램이 하나도 없다');
  const lastTick = Math.max(...arrivals);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { datagrams: plan.map((d) => ({ ...d })) },
  });

  const delivered: number[] = [];
  for (let tick = 1; tick <= lastTick; tick += 1) {
    // 걸음 0 은 보내는 쪽 줄이 이미 읽을 거리라 첫 틱 앞에도 문을 둔다
    if (!(await pause())) return;
    const arrived: { index: number; after: number[] }[] = [];
    plan.forEach((d, index) => {
      if (d.arriveTick !== tick) return;
      const after = delivered.filter((j) => plan[j]!.sendTick > d.sendTick);
      arrived.push({ index, after });
      delivered.push(index);
    });
    const sentIndex = plan.findIndex((d) => d.sendTick === tick);
    const sent = sentIndex < 0 ? null : sentIndex;
    const lost = sent !== null && plan[sent]!.arriveTick === null;
    await ctx.emit({
      type: 'tick',
      payload: { tick, arrived, sent, lost, last: tick === lastTick },
    });
  }
}
