/**
 * Paxos projector — round · arrive · settle 을 무대 메서드로, phase 를 코드 패널 강조로 옮긴다.
 * payload 는 typeof 가드로 읽고, 빈 값을 지어내지 않고 던진다 (C6 · C9).
 * 운동 길이는 걸음마다 runtime.getSpeed() 를 읽어 재생 속도를 따라간다. 운동이 끝나야 걸음이 끝난다.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { PaxosStage, PaxosStageArrive, PaxosStagePair, PaxosStageRound } from './paxos-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

const MOTION_MS = 600;

type Rec = Record<string, unknown>;

function rec(x: unknown, what: string): Rec {
  if (typeof x !== 'object' || x === null) throw new Error(`paxos projector: ${what} 가 객체가 아니다`);
  return x as Rec;
}
function num(p: Rec, k: string): number {
  const v = p[k];
  if (typeof v !== 'number') throw new Error(`paxos projector: ${k} 가 수가 아니다`);
  return v;
}
function numOrNull(p: Rec, k: string): number | null {
  const v = p[k];
  if (v === null) return null;
  if (typeof v !== 'number') throw new Error(`paxos projector: ${k} 가 수도 null 도 아니다`);
  return v;
}
function str(p: Rec, k: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`paxos projector: ${k} 가 글이 아니다`);
  return v;
}
function bool(p: Rec, k: string): boolean {
  const v = p[k];
  if (typeof v !== 'boolean') throw new Error(`paxos projector: ${k} 가 참거짓이 아니다`);
  return v;
}
function strs(p: Rec, k: string): string[] {
  const v = p[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`paxos projector: ${k} 가 글 목록이 아니다`);
  return v as string[];
}
function pair(p: Rec, k: string): PaxosStagePair | null {
  const v = p[k];
  if (v === null) return null;
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number') {
    throw new Error(`paxos projector: ${k} 가 (번호, 값) 쌍이 아니다`);
  }
  return [v[0], v[1]];
}

function readRound(p: Rec): PaxosStageRound {
  const proposersRaw = p['proposers'];
  const orderRaw = p['order'];
  if (!Array.isArray(proposersRaw) || !Array.isArray(orderRaw)) throw new Error('paxos projector: round 의 목록이 없다');
  return {
    acceptors: strs(p, 'acceptors'),
    majority: num(p, 'majority'),
    proposers: proposersRaw.map((x) => {
      const r = rec(x, 'proposer');
      return { id: str(r, 'id'), n: num(r, 'n'), value: num(r, 'value') };
    }),
    order: orderRaw.map((x) => {
      const r = rec(x, 'order');
      return { key: str(r, 'key'), who: str(r, 'who'), kind: str(r, 'kind'), to: str(r, 'to'), n: num(r, 'n') };
    }),
  };
}

function readArrive(p: Rec): PaxosStageArrive {
  return {
    slot: num(p, 'slot'),
    key: str(p, 'key'),
    who: str(p, 'who'),
    kind: str(p, 'kind'),
    to: str(p, 'to'),
    n: num(p, 'n'),
    value: numOrNull(p, 'value'),
    outcome: str(p, 'outcome'),
    promised: num(p, 'promised'),
    accepted: pair(p, 'accepted'),
    carried: pair(p, 'carried'),
    promises: num(p, 'promises'),
    best: pair(p, 'best'),
    bestFrom: p['bestFrom'] === null ? null : str(p, 'bestFrom'),
    send: num(p, 'send'),
    picked: bool(p, 'picked'),
    inherited: bool(p, 'inherited'),
    holders: strs(p, 'holders'),
    chosen: numOrNull(p, 'chosen'),
  };
}

export const paxosProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as PaxosStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const motion = (): number => {
    const speed = runtime ? runtime.getSpeed() : 1;
    return speed > 0 ? MOTION_MS / speed : MOTION_MS;
  };
  let majority = 0;
  let p1 = '';
  let p2 = '';

  return {
    async onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const phase = str(rec(e.payload, 'phase'), 'phase');
          code?.highlightPhase?.(phase);
          return;
        }
        case 'round': {
          const p = rec(e.payload, 'round');
          const r = readRound(p);
          majority = r.majority;
          const [a, b] = r.proposers;
          if (!a || !b) throw new Error('paxos projector: 제안자가 둘이 아니다');
          p1 = a.id;
          p2 = b.id;
          const late = r.order.filter((m) => m.who === p2 && m.kind === 'prepare').map((m) => m.to);
          if (late.length !== 2) throw new Error('paxos projector: P2 의 prepare 가 둘이 아니다');
          code?.clearHighlight?.();
          stage?.setCaption(
            t('caption.round', '{p1} accepts before {p2} prepares: {early} · {p2} asks: {qa}·{qb}', {
              p1,
              p2,
              early: num(p, 'early'),
              qa: late[0]!,
              qb: late[1]!,
            }),
          );
          await stage?.setRound(r, motion());
          return;
        }
        case 'arrive': {
          const a = readArrive(rec(e.payload, 'arrive'));
          let text: string;
          if (a.kind === 'prepare') {
            if (a.picked && a.inherited) {
              if (a.bestFrom === null) throw new Error('paxos projector: 이어받았는데 어디서 왔는지 없다');
              text = t('caption.pickInherit', '{who} prepare({n}) → {to} · promises: {got} / {need} · sends {v}, inherited from {from}', {
                who: a.who, n: a.n, to: a.to, got: a.promises, need: majority, v: a.send, from: a.bestFrom,
              });
            } else if (a.picked) {
              text = t('caption.pickOwn', '{who} prepare({n}) → {to} · promises: {got} / {need} · sends its own value {v}', {
                who: a.who, n: a.n, to: a.to, got: a.promises, need: majority, v: a.send,
              });
            } else if (a.carried) {
              text = t('caption.promiseCarried', '{who} prepare({n}) → {to} · promised {n} · carries ({cn}, {cv})', {
                who: a.who, n: a.n, to: a.to, cn: a.carried[0], cv: a.carried[1],
              });
            } else {
              text = t('caption.promise', '{who} prepare({n}) → {to} · promised {n} · carries nothing', { who: a.who, n: a.n, to: a.to });
            }
          } else {
            if (a.value === null) throw new Error('paxos projector: accept 에 값이 없다');
            if (a.outcome === 'reject') {
              text = t('caption.reject', '{who} accept({n}, {v}) → {to} · rejected (promised {p})', {
                who: a.who, n: a.n, v: a.value, to: a.to, p: a.promised,
              });
            } else if (a.holders.length > 0) {
              if (a.chosen === null) throw new Error('paxos projector: 과반인데 정해진 값이 없다');
              text = t('caption.acceptMajority', '{who} accept({n}, {v}) → {to} · accepted · same pair on {count} of {need} needed · chosen: {chosen}', {
                who: a.who, n: a.n, v: a.value, to: a.to, count: a.holders.length, need: majority, chosen: a.chosen,
              });
            } else {
              text = t('caption.accept', '{who} accept({n}, {v}) → {to} · accepted', { who: a.who, n: a.n, v: a.value, to: a.to });
            }
          }
          stage?.setCaption(text);
          await stage?.arrive(a, motion());
          return;
        }
        case 'settle': {
          const p = rec(e.payload, 'settle');
          const value = num(p, 'value');
          stage?.settle({ value, holders: strs(p, 'holders') });
          stage?.setCaption(
            t('caption.settle', 'Chosen value: {value} (from step {step}) · rejected accepts: {rejected} · values chosen: {count}', {
              value,
              step: num(p, 'chosenAt'),
              rejected: num(p, 'rejected'),
              count: num(p, 'chosenValues'),
            }),
          );
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.finishMotion();
      code?.clearHighlight?.();
    },
    onDestroy() {
      stage?.finishMotion();
    },
  };
};
