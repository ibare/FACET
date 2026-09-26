/**
 * Paxos — 두 제안자의 메시지가 서로 끼어들 때 값이 둘로 정해지지 않는 까닭.
 *
 * 수락자 셋(A1 A2 A3) · 제안자 둘(P1 번호 1 · 값 7, P2 번호 2 · 값 9). 메시지 여덟이 한 걸음에 하나씩
 * 수락자에 닿는다. 손잡이 둘이 **닿는 차례**와 **P2 가 묻는 곳**을 정한다.
 *
 * ── 규약 (사양 그대로 — 하나라도 다르게 짜면 다른 수가 나온다)
 *   - 과반 = 수락자 수 ÷ 2 의 몫 + 1 (전체 수에서 셈한다)
 *   - prepare(n) — n > 약속이면 약속 = n, 받아들인 (번호, 값) 을 실어 돌려준다.
 *     이 자료에서 prepare 는 한 번도 거절되지 않는다 — 거절되면 규약 밖이라 던진다
 *   - 제안자는 약속을 과반만큼 받으면 보낼 값을 정한다 = 실려 온 받아들인 것 중 번호가 가장 큰 것의 값,
 *     없으면 제 값. 번호가 같으면 먼저 실려 온 것을 둔다 (`>` 로만 바꾼다 — early 2 · A1·A2 의 걸음 5 · 6 에서
 *     A1 · A2 가 둘 다 (1, 7) 을 실어 와 걸린다. 먼저 온 A1 이 남는다)
 *   - accept(n, v) — n ≥ 약속이면 받아들인다 (약속 = n, 받아들인 것 = (n, v)), 아니면 거절
 *   - 정해짐 = 같은 (번호, 값) 을 받아들인 수락자가 과반. 수락자를 A1 부터 훑어 처음 과반을 이룬 것의 값
 *   - 정해진 걸음 = 과반이 처음 생긴 accept 걸음. 정해진 값이 도중에 다른 값으로 바뀌면 던진다
 *   - 닿는 차례 — P1 prepare 둘(묻는 곳 차례) · P1 accept 둘 사이 `early` 자리에 P2 prepare 둘 · P2 accept 둘.
 *     `early` 는 P2 prepare 둘이 닿기 전에 닿은 P1 accept 의 수 (0 · 1 · 2)
 *
 * ── 이벤트 (걸음 0 처음 · 1..8 메시지 하나 · 9 끝 = 한 판 10 걸음)
 *   phase  (silent) { phase: 'promise' | 'pick' | 'accept' | 'reject' | 'chosen' }
 *   round  { early, quorum, majority, acceptors: string[], proposers: { id, n, value }[],
 *            order: { key, who, kind: 'prepare' | 'accept', to, n }[] }
 *          판의 처음 모습. order 는 여덟 메시지가 닿는 차례, key 는 판이 바뀌어도 같은 메시지를 가리킨다
 *   arrive { step, slot, key, who, kind, to, n, value: number | null, outcome: 'promise' | 'accept' | 'reject',
 *            promised, accepted: [n, v] | null, carried: [n, v] | null, promises, best: [n, v] | null,
 *            bestFrom: string | null, send, picked: boolean, inherited: boolean, holders: string[],
 *            chosen: number | null, chosenAt: number | null, rejected }
 *          step 은 걸음 번호(1..8), slot 은 order 의 색인(0..7). promised · accepted 는 닿은 뒤 그 수락자의 것.
 *          promises · best · bestFrom · send 는 보낸 제안자의 것(닿은 뒤). holders 는 지금 같은 (번호, 값) 으로
 *          과반을 이룬 수락자들(없으면 빈 목록). chosen · chosenAt 은 한 번 정해지면 판 끝까지 남는다
 *   settle { value, chosenAt, rejected, chosenValues, inherited, p2Sent, holders: string[] }
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *   promise  제안자의 첫 약속이 닿은 걸음
 *   pick     과반째 약속이 닿아 보낼 값을 고른 걸음
 *   accept   accept 가 받아들여진 걸음
 *   reject   accept 가 튕겨 난 걸음
 *   chosen   끝 — 정해진 값을 센다
 *
 * ── 계기 (판마다 지금 값을 들고 차이만 보낸다 · 첫 판에 0 도 보낸다 · 판이 바뀌면 0 으로 되돌린다)
 *   rejected-accepts  튕겨 난 accept 의 수
 *   chosen-values     정해진 값의 수 (서로 다른 값)
 *   inherited-values  제 값 대신 이어받은 값을 보낸 제안자의 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PaxosProposer = { id: string; n: number; value: number; asks?: string[] };

export type PaxosData = {
  type: 'paxos';
  stepMs: number;
  acceptors: string[];
  /** 첫째가 앞선 제안자(묻는 곳 asks 고정), 둘째가 끼어드는 제안자(묻는 곳은 손잡이) */
  proposers: PaxosProposer[];
  /** 끼어드는 제안자가 묻는 곳 — 손잡이 quorum 의 값이 색인 */
  quorums: string[][];
  earlyLadder: number[];
  quorumLadder: number[];
  early: number;
  quorum: number;
};

export type PaxosPair = [number, number];

export type PaxosArrival = {
  key: string;
  who: string;
  kind: 'prepare' | 'accept';
  to: string;
  n: number;
};

export type PaxosStep = PaxosArrival & {
  step: number;
  slot: number;
  phase: 'promise' | 'pick' | 'accept' | 'reject';
  value: number | null;
  outcome: 'promise' | 'accept' | 'reject';
  promised: number;
  accepted: PaxosPair | null;
  carried: PaxosPair | null;
  promises: number;
  best: PaxosPair | null;
  bestFrom: string | null;
  send: number;
  picked: boolean;
  inherited: boolean;
  holders: string[];
  chosen: number | null;
  chosenAt: number | null;
  rejected: number;
};

export type PaxosRound = {
  early: number;
  quorum: number;
  majority: number;
  order: PaxosArrival[];
  steps: PaxosStep[];
  value: number;
  chosenAt: number;
  rejected: number;
  chosenValues: number;
  inherited: number;
  p2Sent: number;
  holders: string[];
  /** 끝 상태 — 수락자 차례로 약속 · 받아들인 것 */
  final: { id: string; promised: number; accepted: PaxosPair | null }[];
};

function indexOf(list: string[], id: string): number {
  const i = list.indexOf(id);
  if (i < 0) throw new Error(`paxos: 모르는 수락자 ${id}`);
  return i;
}

/** 같은 (번호, 값) 을 과반이 받아들였으면 그 값과 그 수락자들 — IR 의 chosen 과 같은 훑기 */
function majorityPair(
  acceptors: string[],
  accN: number[],
  accV: number[],
  majority: number,
): { value: number; holders: string[] } | null {
  for (let a = 0; a < accN.length; a += 1) {
    let same = 0;
    const holders: string[] = [];
    for (let b = 0; b < accN.length; b += 1) {
      if (accN[a]! > 0 && accN[b] === accN[a] && accV[b] === accV[a]) {
        same += 1;
        holders.push(acceptors[b]!);
      }
    }
    if (same >= majority) return { value: accV[a]!, holders };
  }
  return null;
}

/** 한 판을 끝까지 셈한다 — 걸음마다의 상태와 끝 값. 알고리즘과 검사가 함께 쓴다 */
export function paxosRound(data: PaxosData, early: number, quorum: number): PaxosRound {
  if (!data.earlyLadder.includes(early)) throw new Error(`paxos: 사다리 밖의 early ${early}`);
  if (!data.quorumLadder.includes(quorum)) throw new Error(`paxos: 사다리 밖의 quorum ${quorum}`);
  const A = data.acceptors;
  const [p1, p2] = data.proposers;
  if (!p1 || !p2 || data.proposers.length !== 2) throw new Error('paxos: 제안자는 둘이어야 한다');
  const p1Asks = p1.asks;
  if (!p1Asks || p1Asks.length !== 2) throw new Error('paxos: 앞선 제안자의 묻는 곳이 둘이 아니다');
  const q = data.quorums[quorum];
  if (!q || q.length !== 2) throw new Error(`paxos: 묻는 곳 ${quorum} 이 둘이 아니다`);
  if (early > p1Asks.length) throw new Error(`paxos: early ${early} 가 accept 수보다 크다`);
  const majority = Math.floor(A.length / 2) + 1;

  // 닿는 차례
  const order: PaxosArrival[] = [];
  const p2Prepares = (): void => {
    q.forEach((to, i) => order.push({ key: `${p2.id}-prepare-${i}`, who: p2.id, kind: 'prepare', to, n: p2.n }));
  };
  p1Asks.forEach((to, i) => order.push({ key: `${p1.id}-prepare-${i}`, who: p1.id, kind: 'prepare', to, n: p1.n }));
  p1Asks.forEach((to, i) => {
    if (i === early) p2Prepares();
    order.push({ key: `${p1.id}-accept-${i}`, who: p1.id, kind: 'accept', to, n: p1.n });
  });
  if (early === p1Asks.length) p2Prepares();
  q.forEach((to, i) => order.push({ key: `${p2.id}-accept-${i}`, who: p2.id, kind: 'accept', to, n: p2.n }));

  const promised = A.map(() => 0);
  const accN = A.map(() => 0);
  const accV = A.map(() => 0);
  const byId = new Map(data.proposers.map((p) => [p.id, p]));
  const promises = new Map<string, number>();
  const best = new Map<string, number>();
  const bestPair = new Map<string, PaxosPair | null>();
  const bestFrom = new Map<string, string | null>();
  const send = new Map<string, number>();
  for (const p of data.proposers) {
    promises.set(p.id, 0);
    best.set(p.id, 0);
    bestPair.set(p.id, null);
    bestFrom.set(p.id, null);
    send.set(p.id, p.value);
  }
  let rejected = 0;
  let chosen: number | null = null;
  let chosenAt: number | null = null;
  const chosenSet = new Set<number>();
  const steps: PaxosStep[] = [];

  order.forEach((m, slot) => {
    const x = indexOf(A, m.to);
    const who = byId.get(m.who);
    if (!who) throw new Error(`paxos: 모르는 제안자 ${m.who}`);
    const step = slot + 1;
    let phase: PaxosStep['phase'];
    let outcome: PaxosStep['outcome'];
    let carried: PaxosPair | null = null;
    let picked = false;
    let value: number | null = null;
    if (m.kind === 'prepare') {
      if (!(m.n > promised[x]!)) throw new Error(`paxos: prepare(${m.n}) 가 ${m.to} 에서 거절됐다 — 규약 밖`);
      promised[x] = m.n;
      carried = accN[x]! > 0 ? [accN[x]!, accV[x]!] : null;
      if (accN[x]! > best.get(m.who)!) {
        best.set(m.who, accN[x]!);
        bestPair.set(m.who, [accN[x]!, accV[x]!]);
        bestFrom.set(m.who, m.to);
        send.set(m.who, accV[x]!);
      }
      const got = promises.get(m.who)! + 1;
      promises.set(m.who, got);
      if (got > majority) throw new Error(`paxos: ${m.who} 의 약속이 과반보다 많다`);
      picked = got === majority;
      phase = picked ? 'pick' : 'promise';
      outcome = 'promise';
    } else {
      if (promises.get(m.who)! < majority) throw new Error(`paxos: ${m.who} 가 과반 약속 없이 accept 를 보냈다`);
      const v = send.get(m.who)!;
      value = v;
      if (m.n >= promised[x]!) {
        promised[x] = m.n;
        accN[x] = m.n;
        accV[x] = v;
        phase = 'accept';
        outcome = 'accept';
      } else {
        rejected += 1;
        phase = 'reject';
        outcome = 'reject';
      }
    }
    const now = majorityPair(A, accN, accV, majority);
    if (now) {
      if (chosen === null) {
        chosen = now.value;
        chosenAt = step;
      } else if (now.value !== chosen) {
        throw new Error(`paxos: 정해진 값이 ${chosen} 에서 ${now.value} 로 바뀌었다`);
      }
      chosenSet.add(now.value);
    }
    steps.push({
      ...m,
      step,
      slot,
      phase,
      value,
      outcome,
      promised: promised[x]!,
      accepted: accN[x]! > 0 ? [accN[x]!, accV[x]!] : null,
      carried,
      promises: promises.get(m.who)!,
      best: bestPair.get(m.who)!,
      bestFrom: bestFrom.get(m.who)!,
      send: send.get(m.who)!,
      picked,
      inherited: send.get(m.who)! !== who.value,
      holders: now ? now.holders : [],
      chosen,
      chosenAt,
      rejected,
    });
  });

  const fin = majorityPair(A, accN, accV, majority);
  if (!fin || chosen === null || chosenAt === null) throw new Error('paxos: 판이 끝났는데 정해진 값이 없다');
  if (fin.value !== chosen) throw new Error(`paxos: 끝 값 ${fin.value} 가 정해진 값 ${chosen} 과 다르다`);
  let inherited = 0;
  for (const p of data.proposers) if (send.get(p.id)! !== p.value) inherited += 1;
  return {
    early,
    quorum,
    majority,
    order,
    steps,
    value: fin.value,
    chosenAt,
    rejected,
    chosenValues: chosenSet.size,
    inherited,
    p2Sent: send.get(p2.id)!,
    holders: fin.holders,
    final: A.map((id, i) => ({
      id,
      promised: promised[i]!,
      accepted: accN[i]! > 0 ? ([accN[i]!, accV[i]!] as PaxosPair) : null,
    })),
  };
}

/** 손잡이 입력에서 early · quorum 을 읽는다 — 사다리 밖이면 던진다 */
function readKnobs(
  data: PaxosData,
  type: string,
  payload: unknown,
  now: { early: number; quorum: number },
): { early: number; quorum: number } {
  if (typeof payload !== 'object' || payload === null) throw new Error(`paxos: ${type} 입력에 payload 가 없다`);
  const p = payload as Record<string, unknown>;
  const value = p['value'];
  if (typeof value !== 'number') throw new Error(`paxos: ${type} 입력의 value 가 수가 아니다`);
  const pick = (name: string, ladder: number[], own: boolean, current: number): number => {
    let v = current;
    if (own) v = value;
    else if (typeof p[name] === 'string' || typeof p[name] === 'number') v = Number(p[name]);
    if (!ladder.includes(v)) throw new Error(`paxos: 사다리 밖의 ${name} ${String(v)}`);
    return v;
  };
  return {
    early: pick('early', data.earlyLadder, type === 'early', now.early),
    quorum: pick('quorum', data.quorumLadder, type === 'quorum', now.quorum),
  };
}

export async function paxosAlgorithm(ctx: FacetContext<PaxosData>): Promise<void> {
  const rctx = ctx as ReactiveContext<PaxosData>;
  const data = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const before = shown.get(name);
    if (before === undefined) ctx.metric(name, value);
    else if (before !== value) ctx.metric(name, value - before);
    shown.set(name, value);
  };

  const playRound = async (early: number, quorum: number): Promise<boolean> => {
    const r = paxosRound(data, early, quorum);
    setMetric('rejected-accepts', 0);
    setMetric('chosen-values', 0);
    setMetric('inherited-values', 0);
    await ctx.emit({
      type: 'round',
      payload: {
        early,
        quorum,
        majority: r.majority,
        acceptors: [...data.acceptors],
        proposers: data.proposers.map((p) => ({ id: p.id, n: p.n, value: p.value })),
        order: r.order.map((m) => ({ ...m })),
      },
    });
    if (!(await rctx.sleep(data.stepMs))) return false;

    const seen = new Set<number>();
    let inheritedNow = 0;
    for (const s of r.steps) {
      if (ctx.cancelled) return false;
      switch (s.phase) {
        case 'promise':
          await phase('promise');
          break;
        case 'pick':
          await phase('pick');
          break;
        case 'accept':
          await phase('accept');
          break;
        case 'reject':
          await phase('reject');
          break;
      }
      await ctx.emit({
        type: 'arrive',
        payload: {
          ...s,
          accepted: s.accepted ? [...s.accepted] : null,
          carried: s.carried ? [...s.carried] : null,
          best: s.best ? [...s.best] : null,
          holders: [...s.holders],
        },
      });
      setMetric('rejected-accepts', s.rejected);
      if (s.chosen !== null) seen.add(s.chosen);
      setMetric('chosen-values', seen.size);
      if (s.picked && s.inherited) inheritedNow += 1;
      setMetric('inherited-values', inheritedNow);
      if (!(await rctx.sleep(data.stepMs))) return false;
    }

    if (inheritedNow !== r.inherited || seen.size !== r.chosenValues) {
      throw new Error('paxos: 걸음으로 센 계기가 판의 셈과 다르다');
    }
    await phase('chosen');
    await ctx.emit({
      type: 'settle',
      payload: {
        value: r.value,
        chosenAt: r.chosenAt,
        rejected: r.rejected,
        chosenValues: r.chosenValues,
        inherited: r.inherited,
        p2Sent: r.p2Sent,
        holders: [...r.holders],
      },
    });
    return true;
  };

  let knobs = { early: data.early, quorum: data.quorum };
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(knobs.early, knobs.quorum))) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'early' && input.type !== 'quorum') continue;
        knobs = readKnobs(data, input.type, input.payload, knobs);
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
