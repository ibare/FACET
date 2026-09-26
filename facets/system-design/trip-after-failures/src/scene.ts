/**
 * tripAfterFailures 의 장면 — 이벤트를 잇기만 한다. 잇단 실패 · 상태 전이 · 합은 알고리즘이 셈해 싣는다.
 *
 * - 바탕: 부름 수 · 문턱 (initialData) · 막대 축척 (init)
 * - 자취: 지나간 부름마다 결과 · 그때의 잇단 실패 · 기다림
 * - 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readTripData, type CallAnswer } from './algorithm.js';

export type BreakerState = 'closed' | 'open';

export type CallTrace =
  | { call: number; outcome: CallAnswer; streak: number; waitMs: number }
  | { call: number; outcome: 'blocked'; waitMs: number };

export type TripCounters = {
  state: BreakerState;
  streak: number;
  reached: number;
  blocked: number;
  totalWait: number;
  waitMax: number;
};

export type TripStep =
  | { kind: 'start' }
  | { kind: 'reached'; call: number; answer: CallAnswer; streakFrom: number; streak: number; tripped: boolean }
  | { kind: 'blocked'; call: number };

export type TripScene = {
  callCount: number;
  threshold: number;
  /** init 전에는 null — 처음 값은 알고리즘이 셈해 보낸다. */
  counters: TripCounters | null;
  trace: CallTrace[];
  step: TripStep | null;
};

function bad(path: string, why: string): never {
  throw new Error(`tripAfterFailuresScene: ${path} — ${why}`);
}

function field(p: Record<string, unknown>, key: string, path: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${path}.${key}`, '수가 아니다');
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) bad(`${event.type}.payload`, '객체가 아니다');
  return p as Record<string, unknown>;
}

function nextCall(scene: TripScene, call: number, path: string): TripCounters {
  const c = scene.counters;
  if (c === null) bad(path, 'init 전에 부름이 왔다');
  if (call !== scene.trace.length + 1) bad(`${path}.call`, `차례가 어긋났다 (기대 ${scene.trace.length + 1}, 받음 ${call})`);
  if (call > scene.callCount) bad(`${path}.call`, `부름 줄에 없는 부름 ${call}`);
  return c;
}

export const tripAfterFailuresScene: ScenePlan<TripScene> = {
  initial(initialData: unknown): TripScene {
    const data = readTripData(initialData);
    return {
      callCount: data.calls.length,
      threshold: data.threshold,
      counters: null,
      trace: [],
      step: null,
    };
  },

  reduce(scene: TripScene, event: FacetRuntimeEvent): TripScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        if (p.state !== 'closed' && p.state !== 'open') bad('init.state', `모르는 상태 ${String(p.state)}`);
        return {
          ...scene,
          counters: {
            state: p.state,
            streak: field(p, 'streak', 'init'),
            reached: field(p, 'reached', 'init'),
            blocked: field(p, 'blocked', 'init'),
            totalWait: field(p, 'totalWait', 'init'),
            waitMax: field(p, 'waitMax', 'init'),
          },
          trace: [],
          step: { kind: 'start' },
        };
      }
      case 'call-reached': {
        const p = payloadOf(event);
        const call = field(p, 'call', 'call-reached');
        const c = nextCall(scene, call, 'call-reached');
        if (c.state !== 'closed') bad('call-reached', '열린 브레이커를 지나 서비스에 닿았다');
        const answer = p.answer;
        if (answer !== 'ok' && answer !== 'fail') bad('call-reached.answer', `모르는 답 ${String(answer)}`);
        const streakFrom = field(p, 'streakFrom', 'call-reached');
        if (streakFrom !== c.streak) bad('call-reached.streakFrom', `지금 값 ${c.streak} 과 다르다`);
        const streak = field(p, 'streak', 'call-reached');
        const waitMs = field(p, 'waitMs', 'call-reached');
        const tripped = p.tripped;
        if (typeof tripped !== 'boolean') bad('call-reached.tripped', '참거짓이 아니다');
        return {
          ...scene,
          counters: {
            ...c,
            state: tripped ? 'open' : 'closed',
            streak,
            reached: field(p, 'reached', 'call-reached'),
            totalWait: field(p, 'totalWait', 'call-reached'),
          },
          trace: [...scene.trace, { call, outcome: answer, streak, waitMs }],
          step: { kind: 'reached', call, answer, streakFrom, streak, tripped },
        };
      }
      case 'call-blocked': {
        const p = payloadOf(event);
        const call = field(p, 'call', 'call-blocked');
        const c = nextCall(scene, call, 'call-blocked');
        if (c.state !== 'open') bad('call-blocked', '닫힌 브레이커에서 막혔다');
        const waitMs = field(p, 'waitMs', 'call-blocked');
        return {
          ...scene,
          counters: {
            ...c,
            blocked: field(p, 'blocked', 'call-blocked'),
            totalWait: field(p, 'totalWait', 'call-blocked'),
          },
          trace: [...scene.trace, { call, outcome: 'blocked', waitMs }],
          step: { kind: 'blocked', call },
        };
      }
      default:
        throw new Error(`tripAfterFailuresScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
