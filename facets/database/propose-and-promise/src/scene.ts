/**
 * propose-and-promise 장면 — 알고리즘의 이벤트를 잇기만 한다.
 *
 * 약속 견주기 · 과반 판정 · 보낼 값 고르기는 알고리즘이 한다. 장면은 payload 가 말한
 * 결과를 옮겨 적는다. 걸음 0 은 initial 이 initialData 에서 세운다 (수락자 · 제안자 · 이음).
 *
 * - 바탕: acceptors 의 id · proposers 의 id·번호·값 · contacts (제안자마다 메시지가 닿는 수락자) · majority
 * - 자취: 수락자의 약속 · 받아들인 것, 제안자의 약속 수 · 수락 수 · 보낼 값, bounces (튕겨 나온 메시지), chosen
 * - 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { majorityOf, type Pair } from './algorithm.js';

export type AcceptorView = { id: string; promised: number; accepted: Pair | null };
export type ProposerView = {
  id: string;
  n: number;
  v: number;
  contacts: string[];
  promises: number;
  accepts: number;
  send: number | null;
  inherited: Pair | null;
};
export type Bounce = {
  proposer: string;
  acceptor: string;
  kind: 'prepare' | 'accept';
  n: number;
  v: number | null;
  promised: number;
};
export type Stray = { acceptor: string; n: number; v: number; count: number };

export type ProposeStep =
  | { kind: 'start' }
  | {
      kind: 'promise';
      proposer: string;
      acceptor: string;
      n: number;
      was: number;
      majority: boolean;
      send: number | null;
      inherited: Pair | null;
      promises: number;
    }
  | { kind: 'prepare-refused'; proposer: string; acceptor: string; n: number; promised: number }
  | { kind: 'accepted'; proposer: string; acceptor: string; n: number; v: number; accepts: number; chosen: Pair | null }
  | { kind: 'accept-refused'; proposer: string; acceptor: string; n: number; v: number; promised: number }
  | { kind: 'done'; chosen: Pair | null; chosenCount: number; stray: Stray[] };

export type ProposeScene = {
  acceptors: AcceptorView[];
  proposers: ProposerView[];
  majority: number;
  bounces: Bounce[];
  chosen: Pair | null;
  step: ProposeStep;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function str(p: Record<string, unknown>, key: string, where: string): string {
  const x = p[key];
  if (typeof x !== 'string') throw new Error(`propose-and-promise: ${where}.${key} 가 문자열이 아니다`);
  return x;
}

function num(p: Record<string, unknown>, key: string, where: string): number {
  const x = p[key];
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new Error(`propose-and-promise: ${where}.${key} 가 수가 아니다`);
  }
  return x;
}

function bool(p: Record<string, unknown>, key: string, where: string): boolean {
  const x = p[key];
  if (typeof x !== 'boolean') throw new Error(`propose-and-promise: ${where}.${key} 가 불리언이 아니다`);
  return x;
}

function pairOrNull(x: unknown, where: string): Pair | null {
  if (x === null) return null;
  if (!isRecord(x)) throw new Error(`propose-and-promise: ${where} 가 (번호, 값) 이 아니다`);
  return { n: num(x, 'n', where), v: num(x, 'v', where) };
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (!isRecord(event.payload)) throw new Error(`propose-and-promise: ${event.type} 의 payload 가 없다`);
  return event.payload;
}

function readData(initialData: unknown): { acceptors: string[]; proposers: ProposerView[] } {
  if (!isRecord(initialData)) throw new Error('propose-and-promise: initialData 가 없다');
  const rawA = initialData['acceptors'];
  const rawP = initialData['proposers'];
  const rawD = initialData['deliveries'];
  if (!Array.isArray(rawA) || !Array.isArray(rawP) || !Array.isArray(rawD)) {
    throw new Error('propose-and-promise: acceptors · proposers · deliveries 가 배열이 아니다');
  }
  const acceptors = rawA.map((a, i) => {
    if (typeof a !== 'string') throw new Error(`propose-and-promise: acceptors[${i}] 가 식별자가 아니다`);
    return a;
  });
  const proposers: ProposerView[] = rawP.map((p, i) => {
    if (!isRecord(p)) throw new Error(`propose-and-promise: proposers[${i}] 모양이 틀렸다`);
    return {
      id: str(p, 'id', `proposers[${i}]`),
      n: num(p, 'n', `proposers[${i}]`),
      v: num(p, 'v', `proposers[${i}]`),
      contacts: [],
      promises: 0,
      accepts: 0,
      send: null,
      inherited: null,
    };
  });
  rawD.forEach((d, i) => {
    if (!isRecord(d)) throw new Error(`propose-and-promise: deliveries[${i}] 모양이 틀렸다`);
    const from = str(d, 'from', `deliveries[${i}]`);
    const to = str(d, 'to', `deliveries[${i}]`);
    const p = proposers.find((x) => x.id === from);
    if (p === undefined) throw new Error(`propose-and-promise: deliveries[${i}] 의 모르는 제안자 ${from}`);
    if (!acceptors.includes(to)) throw new Error(`propose-and-promise: deliveries[${i}] 의 모르는 수락자 ${to}`);
    if (!p.contacts.includes(to)) p.contacts.push(to);
  });
  return { acceptors, proposers };
}

function withAcceptor(
  list: AcceptorView[],
  id: string,
  change: (a: AcceptorView) => AcceptorView,
): AcceptorView[] {
  if (!list.some((a) => a.id === id)) throw new Error(`propose-and-promise: 모르는 수락자 ${id}`);
  return list.map((a) => (a.id === id ? change(a) : a));
}

function withProposer(
  list: ProposerView[],
  id: string,
  change: (p: ProposerView) => ProposerView,
): ProposerView[] {
  if (!list.some((p) => p.id === id)) throw new Error(`propose-and-promise: 모르는 제안자 ${id}`);
  return list.map((p) => (p.id === id ? change(p) : p));
}

export const proposeAndPromiseScene: ScenePlan<ProposeScene> = {
  initial(initialData: unknown): ProposeScene {
    const { acceptors, proposers } = readData(initialData);
    return {
      acceptors: acceptors.map((id) => ({ id, promised: 0, accepted: null })),
      proposers,
      majority: majorityOf(acceptors.length),
      bounces: [],
      chosen: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: ProposeScene, event: FacetRuntimeEvent): ProposeScene {
    switch (event.type) {
      case 'promise': {
        const p = payloadOf(event);
        const proposer = str(p, 'proposer', 'promise');
        const acceptor = str(p, 'acceptor', 'promise');
        const n = num(p, 'n', 'promise');
        const promises = num(p, 'promises', 'promise');
        const majority = bool(p, 'majority', 'promise');
        const send = p['send'] === null ? null : num(p, 'send', 'promise');
        const inherited = pairOrNull(p['inherited'], 'promise.inherited');
        return {
          ...scene,
          acceptors: withAcceptor(scene.acceptors, acceptor, (a) => ({ ...a, promised: n })),
          proposers: withProposer(scene.proposers, proposer, (x) => ({
            ...x,
            promises,
            send,
            inherited: majority ? inherited : x.inherited,
          })),
          step: {
            kind: 'promise',
            proposer,
            acceptor,
            n,
            was: num(p, 'was', 'promise'),
            majority,
            send,
            inherited,
            promises,
          },
        };
      }
      case 'prepare-refused': {
        const p = payloadOf(event);
        const proposer = str(p, 'proposer', 'prepare-refused');
        const acceptor = str(p, 'acceptor', 'prepare-refused');
        const n = num(p, 'n', 'prepare-refused');
        const promised = num(p, 'promised', 'prepare-refused');
        return {
          ...scene,
          bounces: [...scene.bounces, { proposer, acceptor, kind: 'prepare', n, v: null, promised }],
          step: { kind: 'prepare-refused', proposer, acceptor, n, promised },
        };
      }
      case 'accepted': {
        const p = payloadOf(event);
        const proposer = str(p, 'proposer', 'accepted');
        const acceptor = str(p, 'acceptor', 'accepted');
        const n = num(p, 'n', 'accepted');
        const v = num(p, 'v', 'accepted');
        const accepts = num(p, 'accepts', 'accepted');
        const chosen = pairOrNull(p['chosen'], 'accepted.chosen');
        return {
          ...scene,
          acceptors: withAcceptor(scene.acceptors, acceptor, (a) => ({ ...a, promised: n, accepted: { n, v } })),
          proposers: withProposer(scene.proposers, proposer, (x) => ({ ...x, accepts })),
          chosen: chosen ?? scene.chosen,
          step: { kind: 'accepted', proposer, acceptor, n, v, accepts, chosen },
        };
      }
      case 'accept-refused': {
        const p = payloadOf(event);
        const proposer = str(p, 'proposer', 'accept-refused');
        const acceptor = str(p, 'acceptor', 'accept-refused');
        const n = num(p, 'n', 'accept-refused');
        const v = num(p, 'v', 'accept-refused');
        const promised = num(p, 'promised', 'accept-refused');
        return {
          ...scene,
          bounces: [...scene.bounces, { proposer, acceptor, kind: 'accept', n, v, promised }],
          step: { kind: 'accept-refused', proposer, acceptor, n, v, promised },
        };
      }
      case 'done': {
        const p = payloadOf(event);
        const chosen = pairOrNull(p['chosen'], 'done.chosen');
        const raw = p['stray'];
        if (!Array.isArray(raw)) throw new Error('propose-and-promise: done.stray 가 배열이 아니다');
        const stray: Stray[] = raw.map((s, i) => {
          if (!isRecord(s)) throw new Error(`propose-and-promise: done.stray[${i}] 모양이 틀렸다`);
          const where = `done.stray[${i}]`;
          return {
            acceptor: str(s, 'acceptor', where),
            n: num(s, 'n', where),
            v: num(s, 'v', where),
            count: num(s, 'count', where),
          };
        });
        return { ...scene, chosen, step: { kind: 'done', chosen, chosenCount: num(p, 'chosenCount', 'done'), stray } };
      }
      default:
        throw new Error(`propose-and-promise: 모르는 이벤트 ${event.type}`);
    }
  },
};
