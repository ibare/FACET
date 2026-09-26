/**
 * agree-on-one-value 장면 — 알고리즘 이벤트를 잇기만 한다. 셈은 알고리즘이 했다.
 *
 * 바탕 : 받는 쪽 · 제안자(번호 · 제 값 · 보내는 곳) · 과반 · 걸음 수
 * 자취 : 받는 쪽마다 받아들인 것 · 제안자가 나르는 값 · 받은 대답 · 겹친 자리 ·
 *        걸음마다 정해진 값(`track`)
 * 이번 걸음 : `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowAgreeOnOneValueData, type Accepted } from './algorithm.js';

export type AcceptorState = { id: string; accepted: Accepted | null };

export type ProposerState = {
  id: string;
  ballot: number;
  own: number;
  /** 지금 손에 든(나를) 값 */
  carries: number;
  to: string[];
  asks: boolean;
};

export type AnswerState = { by: string; at: string; answer: Accepted | null };

export type AgreeStep =
  | { kind: 'init' }
  | { kind: 'ask'; by: string; at: string; answer: Accepted | null }
  | {
      kind: 'adopt';
      by: string;
      own: number;
      carries: number;
      source: { at: string; ballot: number } | null;
    }
  | {
      kind: 'accept';
      by: string;
      at: string;
      ballot: number;
      value: number;
      was: Accepted | null;
      holding: number;
      ownHolding: number;
      firstDecided: boolean;
    };

export type AgreeOnOneValueScene = {
  acceptors: AcceptorState[];
  proposers: ProposerState[];
  majority: number | null;
  totalSteps: number | null;
  answers: AnswerState[];
  /** 나르는 값이 바뀐 제안자와 버린 제 값 */
  dropped: { by: string; value: number }[];
  overlap: string[];
  /** 걸음마다 정해진 값들 — 칸 i 가 걸음 i */
  track: number[][];
  step: AgreeStep | null;
};

function fail(path: string): never {
  throw new Error(`agreeOnOneValueScene: ${path} 가 어긋났다`);
}

function rec(x: unknown, path: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null) fail(path);
  return x as Record<string, unknown>;
}

function num(x: unknown, path: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) fail(path);
  return x;
}

function str(x: unknown, path: string): string {
  if (typeof x !== 'string') fail(path);
  return x;
}

function bool(x: unknown, path: string): boolean {
  if (typeof x !== 'boolean') fail(path);
  return x;
}

function acceptedOrNull(x: unknown, path: string): Accepted | null {
  if (x === null) return null;
  const r = rec(x, path);
  return { ballot: num(r.ballot, `${path}.ballot`), value: num(r.value, `${path}.value`) };
}

function numList(x: unknown, path: string): number[] {
  if (!Array.isArray(x)) fail(path);
  return x.map((v, i) => num(v, `${path}[${i}]`));
}

function strList(x: unknown, path: string): string[] {
  if (!Array.isArray(x)) fail(path);
  return x.map((v, i) => str(v, `${path}[${i}]`));
}

function findAcceptor(scene: AgreeOnOneValueScene, id: string, path: string): AcceptorState {
  const a = scene.acceptors.find((x) => x.id === id);
  if (a === undefined) throw new Error(`agreeOnOneValueScene: ${path} 의 ${id} 가 받는 쪽에 없다`);
  return a;
}

function findProposer(scene: AgreeOnOneValueScene, id: string, path: string): ProposerState {
  const p = scene.proposers.find((x) => x.id === id);
  if (p === undefined) throw new Error(`agreeOnOneValueScene: ${path} 의 ${id} 가 제안자에 없다`);
  return p;
}

function sameAccepted(a: Accepted | null, b: Accepted | null): boolean {
  if (a === null || b === null) return a === b;
  return a.ballot === b.ballot && a.value === b.value;
}

const KNOWN = ['init', 'ask', 'adopt', 'accept'];

export const agreeOnOneValueScene: ScenePlan<AgreeOnOneValueScene> = {
  initial(initialData: unknown): AgreeOnOneValueScene {
    const d = narrowAgreeOnOneValueData(initialData);
    return {
      acceptors: d.acceptors.map((id) => ({ id, accepted: null })),
      proposers: d.proposers.map((p) => ({
        id: p.id,
        ballot: p.ballot,
        own: p.value,
        carries: p.value,
        to: [...p.to],
        asks: p.asks,
      })),
      majority: null,
      totalSteps: null,
      answers: [],
      dropped: [],
      overlap: [],
      track: [],
      step: null,
    };
  },

  reduce(scene: AgreeOnOneValueScene, event: FacetRuntimeEvent): AgreeOnOneValueScene {
    if (!KNOWN.includes(event.type)) throw new Error(`agreeOnOneValueScene: 모르는 이벤트 ${event.type}`);
    const p = rec(event.payload, `${event.type}.payload`);
    switch (event.type) {
      case 'init': {
        if (scene.majority !== null) fail('init (두 번째)');
        const majority = num(p.majority, 'init.payload.majority');
        const totalSteps = num(p.totalSteps, 'init.payload.totalSteps');
        return { ...scene, majority, totalSteps, track: [[]], step: { kind: 'init' } };
      }
      case 'ask': {
        const by = str(p.by, 'ask.payload.by');
        const at = str(p.at, 'ask.payload.at');
        const prop = findProposer(scene, by, 'ask.payload.by');
        const acc = findAcceptor(scene, at, 'ask.payload.at');
        if (!prop.asks || !prop.to.includes(at)) fail('ask.payload.at (묻는 곳이 아니다)');
        const answer = acceptedOrNull(p.answer, 'ask.payload.answer');
        if (!sameAccepted(answer, acc.accepted)) fail('ask.payload.answer (받는 쪽이 든 것과 다르다)');
        const decided = numList(p.decided, 'ask.payload.decided');
        return {
          ...scene,
          answers: [...scene.answers, { by, at, answer }],
          track: [...scene.track, decided],
          step: { kind: 'ask', by, at, answer },
        };
      }
      case 'adopt': {
        const by = str(p.by, 'adopt.payload.by');
        const prop = findProposer(scene, by, 'adopt.payload.by');
        const own = num(p.own, 'adopt.payload.own');
        if (own !== prop.own || prop.carries !== prop.own) fail('adopt.payload.own');
        const carries = num(p.carries, 'adopt.payload.carries');
        let source: { at: string; ballot: number } | null = null;
        if (p.source !== null) {
          const s = rec(p.source, 'adopt.payload.source');
          source = { at: str(s.at, 'adopt.payload.source.at'), ballot: num(s.ballot, 'adopt.payload.source.ballot') };
          const got = scene.answers.find((r) => r.by === by && r.at === source?.at);
          if (got === undefined || got.answer === null || got.answer.value !== carries) {
            fail('adopt.payload.source (받은 대답에 없다)');
          }
        } else if (carries !== own) {
          fail('adopt.payload.carries (대답 없이 값이 바뀌었다)');
        }
        const overlap = strList(p.overlap, 'adopt.payload.overlap');
        for (const a of overlap) findAcceptor(scene, a, 'adopt.payload.overlap');
        const decided = numList(p.decided, 'adopt.payload.decided');
        return {
          ...scene,
          proposers: scene.proposers.map((x) => (x.id === by ? { ...x, carries } : x)),
          dropped: carries === own ? scene.dropped : [...scene.dropped, { by, value: own }],
          overlap: [...overlap],
          track: [...scene.track, decided],
          step: { kind: 'adopt', by, own, carries, source },
        };
      }
      case 'accept': {
        const by = str(p.by, 'accept.payload.by');
        const at = str(p.at, 'accept.payload.at');
        const prop = findProposer(scene, by, 'accept.payload.by');
        const acc = findAcceptor(scene, at, 'accept.payload.at');
        const ballot = num(p.ballot, 'accept.payload.ballot');
        const value = num(p.value, 'accept.payload.value');
        if (ballot !== prop.ballot) fail('accept.payload.ballot');
        if (value !== prop.carries) fail('accept.payload.value (제안자가 나르는 값과 다르다)');
        const was = acceptedOrNull(p.was, 'accept.payload.was');
        if (!sameAccepted(was, acc.accepted)) fail('accept.payload.was (받는 쪽이 든 것과 다르다)');
        const holding = num(p.holding, 'accept.payload.holding');
        const ownHolding = num(p.ownHolding, 'accept.payload.ownHolding');
        const decided = numList(p.decided, 'accept.payload.decided');
        const firstDecided = bool(p.firstDecided, 'accept.payload.firstDecided');
        return {
          ...scene,
          acceptors: scene.acceptors.map((x) => (x.id === at ? { id: x.id, accepted: { ballot, value } } : x)),
          track: [...scene.track, decided],
          step: { kind: 'accept', by, at, ballot, value, was, holding, ownHolding, firstDecided },
        };
      }
      default:
        throw new Error(`agreeOnOneValueScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
