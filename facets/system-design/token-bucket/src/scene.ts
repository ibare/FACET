/**
 * token-bucket 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 했다.
 *
 * 바탕  base  통 용량 · 채움 빠르기 · 마지막 초 (initialData 에서)
 * 자취  now   지금 초 · 통 안 토큰 · 누적 셈 · 초마다의 기록 (init 이 연다)
 * 이번  step  이번 걸음이 무엇이었나
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { lastSecond, narrowTokenBucketData } from './algorithm.js';

export type TokenBucketSecond = {
  sec: number;
  from: number;
  added: number;
  overflowed: number;
  before: number;
  arrived: number;
  passed: number;
  rejected: number;
  after: number;
};

export type TokenBucketNow = {
  sec: number;
  tokens: number;
  spilledTotal: number;
  rejectedTotal: number;
  passedTotal: number;
  /** 지나간 초의 기록. 1 초부터 차례로 */
  seconds: TokenBucketSecond[];
};

export type TokenBucketScene = {
  base: { capacity: number; refillPerSecond: number; lastSec: number };
  now: TokenBucketNow | null;
  step: { kind: 'start' } | { kind: 'tick'; rec: TokenBucketSecond } | null;
};

function num(payload: Record<string, unknown>, key: string, type: string): number {
  const v = payload[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`token-bucket 장면: ${type}.payload.${key} 가 0 이상의 정수가 아니다`);
  }
  return v;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (!isRecord(p)) throw new Error(`token-bucket 장면: ${event.type}.payload 가 객체가 아니다`);
  return p;
}

function mustEqual(actual: number, expected: number, path: string): void {
  if (actual !== expected) {
    throw new Error(`token-bucket 장면: ${path} 가 ${actual} 인데 장면은 ${expected} 를 가리킨다`);
  }
}

export const tokenBucketScene: ScenePlan<TokenBucketScene> = {
  initial(initialData: unknown): TokenBucketScene {
    const data = narrowTokenBucketData(initialData);
    return {
      base: {
        capacity: data.capacity,
        refillPerSecond: data.refillPerSecond,
        lastSec: lastSecond(data),
      },
      now: null,
      step: null,
    };
  },

  reduce(scene: TokenBucketScene, event: FacetRuntimeEvent): TokenBucketScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const sec = num(p, 'sec', 'init');
        const tokens = num(p, 'tokens', 'init');
        const lastSec = num(p, 'lastSec', 'init');
        mustEqual(sec, 0, 'init.payload.sec');
        mustEqual(lastSec, scene.base.lastSec, 'init.payload.lastSec');
        if (tokens > scene.base.capacity) throw new Error('token-bucket 장면: init.payload.tokens 가 용량을 넘는다');
        return {
          base: { ...scene.base },
          now: { sec, tokens, spilledTotal: 0, rejectedTotal: 0, passedTotal: 0, seconds: [] },
          step: { kind: 'start' },
        };
      }
      case 'tick': {
        const now = scene.now;
        if (now === null) throw new Error('token-bucket 장면: init 앞에 tick 이 왔다');
        const p = payloadOf(event);
        const rec: TokenBucketSecond = {
          sec: num(p, 'sec', 'tick'),
          from: num(p, 'from', 'tick'),
          added: num(p, 'added', 'tick'),
          overflowed: num(p, 'overflowed', 'tick'),
          before: num(p, 'before', 'tick'),
          arrived: num(p, 'arrived', 'tick'),
          passed: num(p, 'passed', 'tick'),
          rejected: num(p, 'rejected', 'tick'),
          after: num(p, 'after', 'tick'),
        };
        mustEqual(rec.sec, now.sec + 1, 'tick.payload.sec');
        if (rec.sec > scene.base.lastSec) throw new Error('token-bucket 장면: tick.payload.sec 가 마지막 초를 넘는다');
        mustEqual(rec.from, now.tokens, 'tick.payload.from');
        mustEqual(rec.before, rec.from + rec.added, 'tick.payload.before');
        mustEqual(rec.added + rec.overflowed, scene.base.refillPerSecond, 'tick.payload.added + overflowed');
        mustEqual(rec.passed + rec.rejected, rec.arrived, 'tick.payload.passed + rejected');
        mustEqual(rec.after, rec.before - rec.passed, 'tick.payload.after');
        if (rec.before > scene.base.capacity) throw new Error('token-bucket 장면: tick.payload.before 가 용량을 넘는다');
        const spilledTotal = num(p, 'spilledTotal', 'tick');
        const rejectedTotal = num(p, 'rejectedTotal', 'tick');
        const passedTotal = num(p, 'passedTotal', 'tick');
        mustEqual(spilledTotal, now.spilledTotal + rec.overflowed, 'tick.payload.spilledTotal');
        mustEqual(rejectedTotal, now.rejectedTotal + rec.rejected, 'tick.payload.rejectedTotal');
        mustEqual(passedTotal, now.passedTotal + rec.passed, 'tick.payload.passedTotal');
        return {
          base: { ...scene.base },
          now: {
            sec: rec.sec,
            tokens: rec.after,
            spilledTotal,
            rejectedTotal,
            passedTotal,
            seconds: [...now.seconds.map((s) => ({ ...s })), { ...rec }],
          },
          step: { kind: 'tick', rec: { ...rec } },
        };
      }
      default:
        throw new Error(`token-bucket 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
