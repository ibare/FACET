/**
 * propose-and-promise — Paxos 수락자의 약속이 작은 번호의 제안을 막는다.
 *
 * 1차 데이터는 수락자 · 제안자(번호 · 값) · 메시지가 수락자에 **닿는 차례**다.
 * 그 차례를 하나씩 돌며 규약으로 수락자의 상태를 바꾼다. 한 걸음 = 메시지 하나가 닿는 것.
 *
 * 규약 (사양 그대로)
 * - 과반 = 수락자 수 ÷ 2 의 몫 + 1
 * - 수락자는 처음에 약속 0 · 받아들인 것 없음
 * - prepare(n): n > 약속이면 약속 = n, 앞서 받아들인 (번호, 값) 을 함께 돌려준다. 아니면 거절
 * - 제안자는 약속을 과반 받으면 accept 를 보낼 수 있다. 보낼 값 = 약속들에 실려 온 받아들인 값 중
 *   번호가 가장 큰 것, 하나도 없으면 제 값. 과반 전에 accept 가 닿으면 던진다
 * - accept(n, v): n ≥ 약속이면 받아들인다 (약속 = n, 받아들인 것 = (n, v)). 아니면 거절
 * - 값이 정해짐 = 같은 (n, v) 를 받아들인 수락자가 과반
 *
 * 이벤트 (silent 는 없다 — 걸음 0 은 장면의 initial 이 initialData 에서 세운다)
 * - `promise`  { proposer, acceptor, n, was, prior: { n, v } | null, promises, majority: boolean,
 *               send: number | null, inherited: { n, v } | null }
 *     prepare 가 닿아 수락자가 약속했다. was = 앞 약속, promises = 그 제안자가 받은 약속 수.
 *     majority 는 이번에 과반이 찼는가. send 는 과반이 찬 뒤의 보낼 값 (아니면 null),
 *     inherited 는 그 값을 이어받은 (번호, 값) — 제 값이면 null
 * - `prepare-refused`  { proposer, acceptor, n, promised }
 * - `accepted` { proposer, acceptor, n, v, accepts, chosen: { n, v } | null }
 *     accepts = 그 제안자의 제안을 받아들인 수락자 수. chosen 은 이번 걸음에 처음 정해진 값
 * - `accept-refused`  { proposer, acceptor, n, v, promised }
 * - `done`     { chosen: { n, v } | null, chosenCount, stray: { acceptor, n, v, count }[] }
 *     chosenCount = 정해진 쌍을 받아들인 수락자 수 (정해진 것이 없으면 0).
 *     stray = 정해진 값이 아닌 받아들인 것과, 그 쌍을 받아들인 수락자 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ProposerSpec = { id: string; n: number; v: number };
export type Delivery = { from: string; kind: 'prepare' | 'accept'; to: string };

export type ProposeAndPromiseFacetData = {
  type: 'propose-and-promise';
  stepMs: number;
  acceptors: string[];
  proposers: ProposerSpec[];
  deliveries: Delivery[];
};

export type Pair = { n: number; v: number };

/** 과반 = 수 ÷ 2 의 몫 + 1. 장면도 이 함수를 부른다. */
export function majorityOf(count: number): number {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`propose-and-promise: 수락자 수가 올바르지 않다 (${count})`);
  }
  return Math.floor(count / 2) + 1;
}

type AcceptorRun = { promised: number; accepted: Pair | null };
type ProposerRun = { spec: ProposerSpec; promises: (Pair | null)[]; accepts: number; send: number | null };

export async function proposeAndPromise(
  ctxBase: FacetContext<ProposeAndPromiseFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<ProposeAndPromiseFacetData>;
  const { stepMs, acceptors, proposers, deliveries } = ctx.data;
  const majority = majorityOf(acceptors.length);

  const acc = new Map<string, AcceptorRun>();
  for (const id of acceptors) acc.set(id, { promised: 0, accepted: null });
  const props = new Map<string, ProposerRun>();
  for (const p of proposers) props.set(p.id, { spec: p, promises: [], accepts: 0, send: null });

  let chosen: Pair | null = null;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 수락자 · 제안자가 이미 서 있는 화면이다 — 읽을 틈을 먼저 둔다
  if (!(await pause())) return;

  for (let i = 0; i < deliveries.length; i += 1) {
    if (ctx.cancelled) return;
    const d = deliveries[i];
    if (d === undefined) throw new Error(`propose-and-promise: 닿는 차례 ${i + 1} 이 비었다`);
    const P = props.get(d.from);
    if (P === undefined) throw new Error(`propose-and-promise: 모르는 제안자 ${d.from} (차례 ${i + 1})`);
    const A = acc.get(d.to);
    if (A === undefined) throw new Error(`propose-and-promise: 모르는 수락자 ${d.to} (차례 ${i + 1})`);
    const n = P.spec.n;

    if (d.kind === 'prepare') {
      if (n > A.promised) {
        const was = A.promised;
        A.promised = n;
        const prior = A.accepted === null ? null : { n: A.accepted.n, v: A.accepted.v };
        P.promises.push(prior);
        let reached = false;
        let inherited: Pair | null = null;
        if (P.promises.length === majority) {
          reached = true;
          for (const x of P.promises) {
            if (x !== null && (inherited === null || x.n > inherited.n)) inherited = x;
          }
          P.send = inherited === null ? P.spec.v : inherited.v;
        }
        await ctx.emit({
          type: 'promise',
          target: `node:${d.to}`,
          payload: {
            proposer: d.from,
            acceptor: d.to,
            n,
            was,
            prior,
            promises: P.promises.length,
            majority: reached,
            send: P.send,
            inherited,
          },
        });
      } else {
        await ctx.emit({
          type: 'prepare-refused',
          target: `node:${d.to}`,
          payload: { proposer: d.from, acceptor: d.to, n, promised: A.promised },
        });
      }
    } else if (d.kind === 'accept') {
      if (P.send === null) {
        throw new Error(`propose-and-promise: ${d.from}: 약속 과반 없이 accept 를 보냈다 (차례 ${i + 1})`);
      }
      const v = P.send;
      if (n >= A.promised) {
        A.promised = n;
        A.accepted = { n, v };
        P.accepts += 1;
        let fresh: Pair | null = null;
        if (chosen === null) {
          let same = 0;
          for (const a of acc.values()) {
            if (a.accepted !== null && a.accepted.n === n && a.accepted.v === v) same += 1;
          }
          if (same >= majority) {
            chosen = { n, v };
            fresh = chosen;
          }
        }
        await ctx.emit({
          type: 'accepted',
          target: `node:${d.to}`,
          payload: { proposer: d.from, acceptor: d.to, n, v, accepts: P.accepts, chosen: fresh },
        });
      } else {
        await ctx.emit({
          type: 'accept-refused',
          target: `node:${d.to}`,
          payload: { proposer: d.from, acceptor: d.to, n, v, promised: A.promised },
        });
      }
    } else {
      throw new Error(`propose-and-promise: 규약에 없는 메시지 종류 (차례 ${i + 1})`);
    }
    if (!(await pause())) return;
  }

  const holders = (pair: Pair): number => {
    let count = 0;
    for (const b of acc.values()) {
      if (b.accepted !== null && b.accepted.n === pair.n && b.accepted.v === pair.v) count += 1;
    }
    return count;
  };
  const stray: { acceptor: string; n: number; v: number; count: number }[] = [];
  for (const [id, a] of acc) {
    if (a.accepted === null) continue;
    const pair = a.accepted;
    if (chosen !== null && pair.n === chosen.n && pair.v === chosen.v) continue;
    stray.push({ acceptor: id, n: pair.n, v: pair.v, count: holders(pair) });
  }
  const chosenCount = chosen === null ? 0 : holders(chosen);
  await ctx.emit({ type: 'done', payload: { chosen, chosenCount, stray } });
}
