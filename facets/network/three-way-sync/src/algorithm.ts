/**
 * three-way-sync — 3-way 핸드셰이크에서 양쪽이 쥔 "확인할 사실" 칸이 채워지는 차례.
 *
 * 모형 (예로 정한 값 — 실제 TCP 의 시작 번호는 무작위다):
 *   - 두 끝 client · server 가 각자 시작 번호(ISN)를 쥔다. 주소 · 플래그 · 상태 이름은 자료다.
 *   - 확인할 사실 넷. 한 끝마다 둘 — "상대 번호를 받았다"(peerNumber) · "내 번호가 닿았다"(ownAcked).
 *   - 시간은 메시지 하나로만 흐른다. 한 걸음 = 메시지 하나가 떠나서 닿기까지.
 *
 * 규약 (사양의 규약 줄 그대로):
 *   - seq: 보내는 쪽이 아직 SYN 을 보낸 적 없으면 제 ISN, 보냈으면 ISN + 1 (SYN 이 번호 하나를 쓴다).
 *   - ack: 받은 시작 번호 + 1. ACK 를 싣는데 상대 번호를 아직 받지 못했으면 던진다.
 *   - SYN 이 닿으면 받는 쪽의 peerNumber 칸, ACK 가 닿으면 받는 쪽의 ownAcked 칸을 채운다.
 *     ack 가 받는 쪽 ISN + 1 과 다르면 던진다. 채울 칸이 없거나 이미 찼으면 던진다.
 *   - 상태: ACK 없는 SYN 을 보내면 보내는 쪽이 SYN-SENT. ACK 없는 SYN 이 닿으면 받는 쪽이
 *     SYN-RECEIVED. 받는 쪽의 칸 둘이 다 차면 ESTABLISHED.
 *
 * 이벤트:
 *   message  (silent 아님, 메시지마다 하나)
 *     payload: {
 *       index: number              — 1 부터 센 메시지 차례
 *       from: string; to: string   — 보내는 쪽 · 받는 쪽 식별자
 *       flags: string[]            — 플래그 글자 (자료)
 *       seq: number
 *       ack: number | null         — ACK 가 없으면 null
 *       senderState: string        — 보낸 뒤 보내는 쪽 상태
 *       receiverState: string      — 닿은 뒤 받는 쪽 상태
 *       fills: { fact: string; field: 'seq' | 'ack'; value: number }[]
 *                                  — 이 메시지가 채운 칸과 그 칸에 들어간 값
 *     }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (두 끝 · 빈 칸 넷).
 * 걸음 0 에 읽을 것이 있어 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FactKind = 'peerNumber' | 'ownAcked';

export type ThreeWaySyncSide = {
  id: string;
  addr: string;
  isn: number;
  state: string;
};

export type ThreeWaySyncFact = {
  id: string;
  holder: string;
  kind: FactKind;
};

export type ThreeWaySyncExchange = {
  from: string;
  to: string;
  flags: string[];
};

export type ThreeWaySyncFacetData = {
  type: 'three-way-sync';
  stepMs: number;
  sides: ThreeWaySyncSide[];
  facts: ThreeWaySyncFact[];
  exchange: ThreeWaySyncExchange[];
  /** 플래그 · 상태 · 필드 글자 — 자료라 번역하지 않는다. */
  syn: string;
  ackFlag: string;
  states: { synSent: string; synReceived: string; established: string };
  fieldText: { seq: string; ack: string };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') throw new Error(`three-way-sync: ${where} 가 빈 글자이거나 글자가 아니다`);
  return v;
}

function int(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`three-way-sync: ${where} 가 음이 아닌 정수가 아니다`);
  }
  return v;
}

/** initialData 를 좁힌다. 모르는 모양이면 던진다. */
export function readThreeWaySyncData(raw: unknown): ThreeWaySyncFacetData {
  if (!isRecord(raw) || raw.type !== 'three-way-sync') throw new Error('three-way-sync: initialData 의 type 이 다르다');
  if (!Array.isArray(raw.sides) || raw.sides.length !== 2) throw new Error('three-way-sync: sides 는 둘이어야 한다');
  const sides = raw.sides.map((s, i): ThreeWaySyncSide => {
    if (!isRecord(s)) throw new Error(`three-way-sync: sides[${i}] 가 객체가 아니다`);
    return { id: str(s.id, `sides[${i}].id`), addr: str(s.addr, `sides[${i}].addr`), isn: int(s.isn, `sides[${i}].isn`), state: str(s.state, `sides[${i}].state`) };
  });
  const sideIds = new Set(sides.map((s) => s.id));
  if (sideIds.size !== 2) throw new Error('three-way-sync: 두 끝의 id 가 같다');
  if (!Array.isArray(raw.facts)) throw new Error('three-way-sync: facts 가 배열이 아니다');
  const facts = raw.facts.map((f, i): ThreeWaySyncFact => {
    if (!isRecord(f)) throw new Error(`three-way-sync: facts[${i}] 가 객체가 아니다`);
    const holder = str(f.holder, `facts[${i}].holder`);
    if (!sideIds.has(holder)) throw new Error(`three-way-sync: facts[${i}].holder ${holder} 는 없는 끝이다`);
    if (f.kind !== 'peerNumber' && f.kind !== 'ownAcked') throw new Error(`three-way-sync: facts[${i}].kind 를 모른다`);
    return { id: str(f.id, `facts[${i}].id`), holder, kind: f.kind };
  });
  if (!Array.isArray(raw.exchange) || raw.exchange.length === 0) throw new Error('three-way-sync: exchange 가 비었다');
  const exchange = raw.exchange.map((m, i): ThreeWaySyncExchange => {
    if (!isRecord(m)) throw new Error(`three-way-sync: exchange[${i}] 가 객체가 아니다`);
    const from = str(m.from, `exchange[${i}].from`);
    const to = str(m.to, `exchange[${i}].to`);
    if (!sideIds.has(from) || !sideIds.has(to) || from === to) throw new Error(`three-way-sync: exchange[${i}] 의 두 끝이 틀렸다`);
    if (!Array.isArray(m.flags) || m.flags.length === 0) throw new Error(`three-way-sync: exchange[${i}].flags 가 비었다`);
    return { from, to, flags: m.flags.map((fl, j) => str(fl, `exchange[${i}].flags[${j}]`)) };
  });
  if (!isRecord(raw.states)) throw new Error('three-way-sync: states 가 없다');
  if (!isRecord(raw.fieldText)) throw new Error('three-way-sync: fieldText 가 없다');
  return {
    type: 'three-way-sync',
    stepMs: int(raw.stepMs, 'stepMs'),
    sides,
    facts,
    exchange,
    syn: str(raw.syn, 'syn'),
    ackFlag: str(raw.ackFlag, 'ackFlag'),
    states: {
      synSent: str(raw.states.synSent, 'states.synSent'),
      synReceived: str(raw.states.synReceived, 'states.synReceived'),
      established: str(raw.states.established, 'states.established'),
    },
    fieldText: { seq: str(raw.fieldText.seq, 'fieldText.seq'), ack: str(raw.fieldText.ack, 'fieldText.ack') },
  };
}

type Fill = { fact: string; field: 'seq' | 'ack'; value: number };

export async function threeWaySync(context: FacetContext<ThreeWaySyncFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ThreeWaySyncFacetData>;
  const data = readThreeWaySyncData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const sideOf = (id: string): ThreeWaySyncSide => {
    const s = data.sides.find((x) => x.id === id);
    if (!s) throw new Error(`three-way-sync: 없는 끝 ${id}`);
    return s;
  };
  const state = new Map(data.sides.map((s) => [s.id, s.state]));
  const sentSyn = new Map(data.sides.map((s) => [s.id, false]));
  const peerNumber = new Map<string, number | null>(data.sides.map((s) => [s.id, null]));
  const filled = new Set<string>();

  const fill = (holder: string, kind: FactKind, field: 'seq' | 'ack', value: number): Fill => {
    const fact = data.facts.find((f) => f.holder === holder && f.kind === kind);
    if (!fact) throw new Error(`three-way-sync: ${holder} 에 ${kind} 칸이 없다`);
    if (filled.has(fact.id)) throw new Error(`three-way-sync: ${fact.id} 칸이 이미 찼다`);
    filled.add(fact.id);
    return { fact: fact.id, field, value };
  };

  for (let i = 0; i < data.exchange.length; i += 1) {
    // 걸음 0 도 읽을 것이 있는 화면이라 첫 메시지 앞에도 문을 둔다.
    if (!(await pause())) return;
    const m = data.exchange[i]!;
    const sender = sideOf(m.from);
    const receiver = sideOf(m.to);
    for (const fl of m.flags) {
      if (fl !== data.syn && fl !== data.ackFlag) throw new Error(`three-way-sync: 모르는 플래그 ${fl}`);
    }
    const hasSyn = m.flags.includes(data.syn);
    const hasAck = m.flags.includes(data.ackFlag);

    const seq = sentSyn.get(sender.id) ? sender.isn + 1 : sender.isn;
    let ack: number | null = null;
    if (hasAck) {
      const known = peerNumber.get(sender.id);
      if (known === null || known === undefined) throw new Error(`three-way-sync: ${sender.id} 는 상대 번호를 모르는 채 ACK 를 실었다`);
      ack = known + 1;
    }
    if (hasSyn) sentSyn.set(sender.id, true);
    if (hasSyn && !hasAck) state.set(sender.id, data.states.synSent);

    const fills: Fill[] = [];
    if (hasSyn) {
      fills.push(fill(receiver.id, 'peerNumber', 'seq', seq));
      peerNumber.set(receiver.id, seq);
      if (!hasAck) state.set(receiver.id, data.states.synReceived);
    }
    if (ack !== null) {
      if (ack !== receiver.isn + 1) throw new Error(`three-way-sync: ack ${ack} 가 ${receiver.id} 의 기대 ${receiver.isn + 1} 와 다르다`);
      fills.push(fill(receiver.id, 'ownAcked', 'ack', ack));
    }
    const mine = data.facts.filter((f) => f.holder === receiver.id);
    if (mine.length > 0 && mine.every((f) => filled.has(f.id))) state.set(receiver.id, data.states.established);

    const senderState = state.get(sender.id);
    const receiverState = state.get(receiver.id);
    if (senderState === undefined || receiverState === undefined) throw new Error('three-way-sync: 상태를 셈할 수 없다');

    await ctx.emit({
      type: 'message',
      payload: { index: i + 1, from: sender.id, to: receiver.id, flags: [...m.flags], seq, ack, senderState, receiverState, fills },
    });
  }
}
