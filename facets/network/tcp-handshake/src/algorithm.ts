/**
 * tcp-handshake — TCP 와 UDP 가 잃음 · 뒤바뀜을 다루는 방식.
 *
 * 한 판 = 틱 0 부터 판 끝 틱까지. 한 걸음 = 한 틱. 한 틱 안의 차례는
 *   ① 받는 쪽(서버)에 닿음 → 앱에 넘기거나 쥠 · TCP 면 확인 번호를 보냄
 *   ② 보내는 쪽(클라이언트)에 확인 닿음
 *   ③ 기한 검사 → 다시 보냄 (TCP)
 *   ④ 새 데이터 보냄 (틱마다 하나)
 * 판 끝 — UDP: 길 위에 아무것도 없고 모두 보낸 틱. TCP: 거기에 더해 모두 확인되고 핸드셰이크가 끝난 틱.
 *
 * 규약 (사양 · 공통 안내문)
 *   - 조각 번호로 센다 (d1 … d6). 확인 번호 = 다음에 기대하는 조각 번호 (누적, 1 부터 — 다 받으면 7)
 *   - 연결이 열린 틱 open: UDP 0 · TCP 2 × handshakeLeg. 데이터 d i 는 틱 open + i 에 떠나고 지연 뒤에 닿는다
 *   - 잃는 수 k 면 lostOrder 의 앞 k 개가 첫 보냄에서 사라진다
 *   - 기한 — 확인 안 된 가장 앞 조각 하나에만 건다. 기한 = 그 조각을 마지막으로 보낸 틱 + rto
 *   - 같은 번호 확인이 거듭 와도 보내는 쪽은 아무것도 하지 않는다 (빠른 재전송 없음)
 *   - extra-packets = 핸드셰이크 3 + 데이터 확인 + 다시 보낸 조각
 *   - 동률 — 한 틱에 받는 쪽에 데이터 둘이 닿으면 셈할 수 없어 던진다. 이 데이터에선 걸리지 않는다
 *
 * 던진다 (C6): 한 틱에 받는 쪽에 둘이 닿음 · 이미 넘긴 조각이 또 닿음 · 잃지 않은 조각을 다시 보냄 ·
 *   연결이 열리기 전에 데이터가 닿음 · 판이 200 틱 안에 끝나지 않음 · 틱 흉내와 receiveInOrder 가 어긋남 ·
 *   모르는 방식 · 사다리 밖 잃는 수.
 *
 * 이벤트
 *   round  { method: 'udp' | 'tcp', lossCount: number, lastTick: number, axisMax: number, segments: string[],
 *            ghostAvailable: boolean }                        silent — 판 머리. 곧바로 tick 0 이 온다
 *   tick   { tick, method, clientState: string | null, serverState: string | null,
 *            listenPort: string, connKey: string | null,            (연결 소켓의 네 짝 — TCP 틱 6 부터)
 *            flights: Packet[], lostNow: Packet[],                  (길 위 · 이번 틱에 길에서 사라진 것)
 *            held: number[], copies: number[], handed: number[],    (조각 번호 1 부터)
 *            handTick: number[],                                    (조각마다 넘긴 틱, 못 넘겼으면 -1 — 지금까지)
 *            serverNotes: Note[], clientNotes: Note[],
 *            final: { received: number, lastDelivery: number, missing: number[] } | null }
 *     Packet = { id, kind: 'syn' | 'synAck' | 'ack' | 'data' | 'dataAck', label: string, ackNo: number,
 *                seg: number, dir: 'out' | 'back', sent: number, arrive: number }
 *     Note   = { kind: <아래>, seg?: number, ack?: number, list?: number[], want?: number, count?: number, port?: string }
 *       serverNotes kind: 'listen' | 'synArrived' | 'ackArrived' | 'handedUdp' | 'handed' | 'held'
 *       clientNotes kind: 'synSent' | 'synAckArrived' | 'ackBack' | 'resent' | 'sent' | 'sentLost'
 *   phase  { phase } silent — 받는 쪽에 데이터가 닿는 틱에만, 그 틱의 sleep 앞에 하나
 *
 * phase 어휘 (irs.ts 와 같다): hand-over · hold-back · release-run
 *   UDP 닿는 틱 hand-over · TCP 쥐기만 한 틱 hold-back · TCP 하나라도 넘긴 틱 release-run
 *
 * 계기 (판 머리에서 0 으로 되돌리고 차이만 보낸다)
 *   app-received        앱이 받은 조각 수
 *   last-delivery-tick  앱이 마지막으로 받은 틱
 *   extra-packets       덧붙은 패킷 — 핸드셰이크 · 확인 · 다시 보냄을 보내는 걸음에 더한다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TcpHandshakeData = {
  type: 'tcp-handshake';
  stepMs: number;
  client: string;
  server: string;
  segments: string[];
  delays: number[];
  lostOrder: number[];
  lossLadder: number[];
  methods: string[];
  method: number;
  lossCount: number;
  handshakeLeg: number;
  ackLeg: number;
  rto: number;
  flags: { syn: string; synAck: string; ack: string };
  states: {
    closed: string;
    listen: string;
    synSent: string;
    synReceived: string;
    established: string;
  };
};

export type PacketKind = 'syn' | 'synAck' | 'ack' | 'data' | 'dataAck';

export type Packet = {
  id: string;
  kind: PacketKind;
  label: string;
  ackNo: number;
  seg: number;
  dir: 'out' | 'back';
  sent: number;
  arrive: number;
};

export type Note = {
  kind: string;
  seg?: number;
  ack?: number;
  list?: number[];
  want?: number;
  count?: number;
  port?: string;
};

export type TickFrame = {
  tick: number;
  clientState: string | null;
  serverState: string | null;
  connKey: string | null;
  flights: Packet[];
  lostNow: Packet[];
  held: number[];
  copies: number[];
  handed: number[];
  serverNotes: Note[];
  clientNotes: Note[];
  phase: 'hand-over' | 'hold-back' | 'release-run' | null;
  extraSent: number;
};

export type RoundResult = {
  method: 'udp' | 'tcp';
  frames: TickFrame[];
  arrive: number[];
  handTick: number[];
  received: number;
  lastDelivery: number;
  extra: number;
  resent: number;
  lastTick: number;
};

const MAX_TICKS = 200;

/**
 * 받는 쪽 셈 — IR `receiveInOrder` 와 한 줄씩 같다. handTick 을 채우고 넘긴 수를 돌려준다.
 * held · handTick 은 부르는 쪽이 조각 수만큼 0 · -1 로 채워 건넨다.
 */
export function receiveInOrder(
  arrive: number[],
  hold: number,
  held: number[],
  handTick: number[],
): number {
  const n = arrive.length;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (arrive[i]! > last) last = arrive[i]!;
  }
  let expected = 0;
  let delivered = 0;
  let heldCount = 0;
  for (let tick = 0; tick <= last; tick++) {
    for (let i = 0; i < n; i++) {
      if (arrive[i] === tick) {
        if (hold === 0) {
          handTick[i] = tick;
          delivered = delivered + 1;
        } else {
          held[i] = 1;
          if (i !== expected) heldCount = heldCount + 1;
          while (expected < n) {
            if (held[expected] === 0) break;
            handTick[expected] = tick;
            held[expected] = 0;
            if (expected !== i) heldCount = heldCount - 1;
            expected = expected + 1;
            delivered = delivered + 1;
          }
        }
      }
    }
  }
  return delivered;
}

function portOf(address: string): string {
  const at = address.lastIndexOf(':');
  if (at < 0 || at === address.length - 1) throw new Error(`주소에 포트가 없다: ${address}`);
  return address.slice(at + 1);
}

/** 한 판을 틱마다 흉내 낸다. 화면이 그리는 값은 모두 여기서 나온다. */
export function simulateRound(data: TcpHandshakeData, methodIndex: number, lossCount: number): RoundResult {
  const method = data.methods[methodIndex];
  if (method !== 'udp' && method !== 'tcp') throw new Error(`모르는 방식: ${String(method)}`);
  if (!data.lossLadder.includes(lossCount)) throw new Error(`사다리 밖 잃는 수: ${lossCount}`);
  if (lossCount > data.lostOrder.length) throw new Error('잃는 수가 lostOrder 보다 크다');
  const n = data.segments.length;
  if (data.delays.length !== n) throw new Error('조각 수와 지연 수가 다르다');
  const tcp = method === 'tcp';
  const leg = data.handshakeLeg;
  const open = tcp ? 2 * leg : 0;
  const serverOpenTick = tcp ? 3 * leg : 0;
  const lostLeft = data.lostOrder.slice(0, lossCount);
  const firstLost = new Set(lostLeft);
  const connKey = `${data.client} ↔ ${data.server}`;

  let clientState: string | null = tcp ? data.states.closed : null;
  let serverState: string | null = tcp ? data.states.listen : null;
  let connOpen = false;
  let flights: Packet[] = [];
  const sendTick = new Map<number, number>();
  const arrive: number[] = Array.from({ length: n }, () => -1);
  const handTick: number[] = Array.from({ length: n }, () => -1);
  const heldNow: number[] = Array.from({ length: n }, () => 0);
  let expected = 0;
  let una = 1;
  let nxt = 1;
  let resent = 0;
  let extra = 0;
  const frames: TickFrame[] = [];

  const launch = (p: Omit<Packet, 'id'>): Packet => {
    const pk: Packet = { ...p, id: `${p.kind}-${p.seg}-${p.ackNo}-${p.sent}` };
    return pk;
  };

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const serverNotes: Note[] = [];
    const clientNotes: Note[] = [];
    const lostNow: Packet[] = [];
    const handed: number[] = [];
    let extraSent = 0;
    let phase: TickFrame['phase'] = null;

    if (!tcp && tick === 0) serverNotes.push({ kind: 'listen', port: portOf(data.server) });

    // ① 받는 쪽에 닿음
    const atServer = flights.filter((f) => f.dir === 'out' && f.arrive === tick);
    const dataHere = atServer.filter((f) => f.kind === 'data');
    if (dataHere.length > 1) throw new Error(`틱 ${tick} 에 받는 쪽에 둘이 닿는다`);
    flights = flights.filter((f) => !(f.dir === 'out' && f.arrive === tick));
    for (const f of atServer) {
      if (f.kind === 'syn') {
        serverState = data.states.synReceived;
        flights.push(launch({ kind: 'synAck', label: data.flags.synAck, ackNo: 0, seg: 0, dir: 'back', sent: tick, arrive: tick + leg }));
        extraSent += 1;
        serverNotes.push({ kind: 'synArrived' });
      } else if (f.kind === 'ack') {
        serverState = data.states.established;
        connOpen = true;
        serverNotes.push({ kind: 'ackArrived' });
      } else if (f.kind === 'data') {
        const i = f.seg - 1;
        if (tcp && tick < serverOpenTick) throw new Error('연결이 열리기 전에 데이터가 닿는다');
        if (arrive[i] !== -1) throw new Error(`${data.segments[i]} 이 두 번 닿는다 — 헛 재전송`);
        arrive[i] = tick;
        if (!tcp) {
          handTick[i] = tick;
          handed.push(f.seg);
          phase = 'hand-over';
          serverNotes.push({ kind: 'handedUdp', seg: f.seg });
        } else {
          heldNow[i] = 1;
          while (expected < n && heldNow[expected] === 1) {
            heldNow[expected] = 0;
            handTick[expected] = tick;
            handed.push(expected + 1);
            expected += 1;
          }
          const ackNo = expected + 1;
          flights.push(launch({ kind: 'dataAck', label: String(ackNo), ackNo, seg: 0, dir: 'back', sent: tick, arrive: tick + data.ackLeg }));
          extraSent += 1;
          const heldCount = heldNow.reduce((s, v) => s + v, 0);
          if (handed.length > 0) {
            phase = 'release-run';
            serverNotes.push({ kind: 'handed', seg: f.seg, list: [...handed], ack: ackNo });
          } else {
            phase = 'hold-back';
            serverNotes.push({ kind: 'held', seg: f.seg, want: expected + 1, count: heldCount, ack: ackNo });
          }
        }
      } else {
        throw new Error(`받는 쪽에 닿을 수 없는 패킷: ${f.kind}`);
      }
    }

    // ② 보내는 쪽에 닿음
    const atClient = flights.filter((f) => f.dir === 'back' && f.arrive === tick);
    flights = flights.filter((f) => !(f.dir === 'back' && f.arrive === tick));
    for (const f of atClient) {
      if (f.kind === 'synAck') {
        clientState = data.states.established;
        flights.push(launch({ kind: 'ack', label: data.flags.ack, ackNo: 0, seg: 0, dir: 'out', sent: tick, arrive: tick + leg }));
        extraSent += 1;
        clientNotes.push({ kind: 'synAckArrived' });
      } else if (f.kind === 'dataAck') {
        clientNotes.push({ kind: 'ackBack', ack: f.ackNo });
        if (f.ackNo > una) una = f.ackNo;
      } else {
        throw new Error(`보내는 쪽에 닿을 수 없는 패킷: ${f.kind}`);
      }
    }

    // 틱 0 의 SYN — ①② 뒤, 보냄 자리
    if (tcp && tick === 0) {
      clientState = data.states.synSent;
      flights.push(launch({ kind: 'syn', label: data.flags.syn, ackNo: 0, seg: 0, dir: 'out', sent: 0, arrive: leg }));
      extraSent += 1;
      clientNotes.push({ kind: 'synSent' });
    }

    // ③ 기한 — 확인 안 된 가장 앞 조각 하나에만
    if (tcp && una <= n) {
      const last = sendTick.get(una);
      if (last !== undefined && tick >= last + data.rto) {
        const at = lostLeft.indexOf(una);
        if (at < 0) throw new Error(`헛 재전송 — ${data.segments[una - 1]} 은 잃지 않았다`);
        lostLeft.splice(at, 1);
        sendTick.set(una, tick);
        resent += 1;
        extraSent += 1;
        flights.push(launch({ kind: 'data', label: data.segments[una - 1]!, ackNo: 0, seg: una, dir: 'out', sent: tick, arrive: tick + data.delays[una - 1]! }));
        clientNotes.push({ kind: 'resent', seg: una });
      }
    }

    // ④ 새 보냄 — 틱마다 하나
    if (nxt <= n && tick >= open + nxt) {
      if (tick !== open + nxt) throw new Error('보냄이 밀렸다');
      sendTick.set(nxt, tick);
      const pk = launch({ kind: 'data', label: data.segments[nxt - 1]!, ackNo: 0, seg: nxt, dir: 'out', sent: tick, arrive: tick + data.delays[nxt - 1]! });
      if (firstLost.has(nxt)) {
        lostNow.push(pk);
        clientNotes.push({ kind: 'sentLost', seg: nxt });
      } else {
        flights.push(pk);
        clientNotes.push({ kind: 'sent', seg: nxt });
      }
      nxt += 1;
    }

    extra += extraSent;
    const copies: number[] = [];
    if (tcp) for (let s = una; s < nxt; s++) copies.push(s);
    const held: number[] = [];
    for (let i = 0; i < n; i++) if (heldNow[i] === 1) held.push(i + 1);

    frames.push({
      tick,
      clientState,
      serverState,
      connKey: connOpen ? connKey : null,
      flights: flights.map((f) => ({ ...f })),
      lostNow,
      held,
      copies,
      handed,
      serverNotes,
      clientNotes,
      phase,
      extraSent,
    });

    const allSent = nxt > n;
    const done = tcp
      ? allSent && una > n && flights.length === 0 && tick > serverOpenTick
      : allSent && flights.length === 0;
    if (done) {
      // 받는 쪽 셈을 IR 과 같은 함수로 다시 해 틱 흉내와 견준다
      const handCheck = Array.from({ length: n }, () => -1);
      const heldCheck = Array.from({ length: n }, () => 0);
      const received = receiveInOrder(arrive, tcp ? 1 : 0, heldCheck, handCheck);
      for (let i = 0; i < n; i++) {
        if (handCheck[i] !== handTick[i]) throw new Error('틱 흉내와 receiveInOrder 가 어긋난다');
      }
      const lastDelivery = Math.max(...handTick);
      if (lastDelivery < 0) throw new Error('앱에 넘긴 조각이 없다');
      return { method, frames, arrive, handTick, received, lastDelivery, extra, resent, lastTick: tick };
    }
  }
  throw new Error(`판이 ${MAX_TICKS} 틱 안에 끝나지 않는다`);
}

type Input = { type: string; payload?: unknown };

export async function tcpHandshakeAlgorithm(context: FacetContext<TcpHandshakeData>): Promise<void> {
  const ctx = context as ReactiveContext<TcpHandshakeData>;
  const data = ctx.data;
  if (data.type !== 'tcp-handshake') throw new Error(`모르는 자료: ${String(data.type)}`);

  const shown = new Map<string, number>();
  /** 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다. */
  const setMetric = (name: string, value: number): void => {
    const before = shown.get(name);
    const delta = value - (before ?? 0);
    if (before === undefined || delta !== 0) ctx.metric(name, delta);
    shown.set(name, value);
  };
  const phase = (name: 'hand-over' | 'hold-back' | 'release-run') =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 틱 축 끝 — 모든 손잡이 조합 중 가장 긴 판. 판마다 축을 늘리지 않으려고 처음에 한 번 셈한다
  let axisMax = 0;
  for (let m = 0; m < data.methods.length; m++) {
    for (const k of data.lossLadder) axisMax = Math.max(axisMax, simulateRound(data, m, k).lastTick);
  }

  let methodIndex = data.method;
  let lossCount = data.lossCount;
  let played = false;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const round = simulateRound(data, methodIndex, lossCount);

      setMetric('app-received', 0);
      setMetric('last-delivery-tick', 0);
      setMetric('extra-packets', 0);
      await ctx.emit({
        type: 'round',
        payload: {
          method: round.method,
          lossCount,
          lastTick: round.lastTick,
          axisMax,
          segments: [...data.segments],
          ghostAvailable: played,
        },
        silent: true,
      });

      let received = 0;
      let extra = 0;
      let lastDelivery = 0;
      const handSoFar: number[] = Array.from({ length: data.segments.length }, () => -1);
      for (const frame of round.frames) {
        if (ctx.cancelled) return;
        for (const s of frame.handed) handSoFar[s - 1] = frame.tick;
        received += frame.handed.length;
        if (frame.handed.length > 0) lastDelivery = frame.tick;
        extra += frame.extraSent;
        setMetric('app-received', received);
        setMetric('last-delivery-tick', lastDelivery);
        setMetric('extra-packets', extra);
        const isLast = frame.tick === round.lastTick;
        const missing: number[] = [];
        for (let i = 0; i < handSoFar.length; i++) if (handSoFar[i] === -1) missing.push(i + 1);
        await ctx.emit({
          type: 'tick',
          payload: {
            tick: frame.tick,
            method: round.method,
            clientState: frame.clientState,
            serverState: frame.serverState,
            listenPort: portOf(data.server),
            connKey: frame.connKey,
            flights: frame.flights,
            lostNow: frame.lostNow,
            held: frame.held,
            copies: frame.copies,
            handed: frame.handed,
            handTick: [...handSoFar],
            serverNotes: frame.serverNotes,
            clientNotes: frame.clientNotes,
            final: isLast ? { received, lastDelivery, missing } : null,
          },
        });
        if (frame.phase === 'hand-over') await phase('hand-over');
        else if (frame.phase === 'hold-back') await phase('hold-back');
        else if (frame.phase === 'release-run') await phase('release-run');
        if (!(await ctx.sleep(data.stepMs))) return;
      }
      if (received !== round.received || lastDelivery !== round.lastDelivery || extra !== round.extra) {
        throw new Error('걸음마다 더한 계기와 판 셈이 어긋난다');
      }
      played = true;

      // 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input: Input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'method' && input.type !== 'lossCount') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) continue;
        const value = (p as { value?: unknown }).value;
        if (typeof value !== 'number') continue;
        if (input.type === 'method') {
          if (!Number.isInteger(value) || value < 0 || value >= data.methods.length) {
            throw new Error(`사다리 밖 방식: ${value}`);
          }
          methodIndex = value;
        } else {
          if (!data.lossLadder.includes(value)) throw new Error(`사다리 밖 잃는 수: ${value}`);
          lossCount = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
