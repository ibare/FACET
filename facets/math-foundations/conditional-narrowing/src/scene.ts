/**
 * conditional-narrowing 장면.
 *
 * 바탕  — 눈의 수 · 결과 전부 · 사건 기호와 문턱 (initialData 에서 initial 이 베낀다)
 * 자취  — A 표시 · 떠난 결과 · 다시 센 A · 두 몫
 * 이번  — step (걸음의 종류와 계기값)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { enumerateOutcomes, narrowConditionalNarrowingData, type Outcome } from './algorithm.js';

export type Share = { num: number; den: number; pct: number };

export type NarrowingStep =
  | { kind: 'world' }
  | { kind: 'markA'; members: number[] }
  | { kind: 'leave'; leaving: number[]; leavingA: number[]; from: number; to: number }
  | { kind: 'recount'; members: number[] }
  | { kind: 'answer' };

export type ConditionalNarrowingScene = {
  faces: number;
  outcomes: Outcome[];
  symbolA: string;
  symbolB: string;
  sumAtLeast: number;
  firstAtLeast: number;
  /** A 에 드는 결과 번호 (markA 뒤). */
  markedA: number[] | null;
  /** 앞의 몫 P(A). */
  shareA: Share | null;
  /** 떠난 결과 번호 (leave 뒤). */
  departed: number[] | null;
  /** 떠난 것 가운데 A 였던 번호. */
  departedA: number[] | null;
  /** 남은 세상 크기 (leave 뒤). */
  world: number;
  /** 남은 세상 안에서 다시 센 A (recount 뒤). */
  recounted: number[] | null;
  /** P(A | B) (answer 뒤). */
  shareGiven: Share | null;
  step: NarrowingStep;
};

function fail(path: string, why: string): never {
  throw new Error(`conditional-narrowing scene: ${path} — ${why}`);
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${type}.payload.${key}`, '수가 아니다');
  return v;
}

function indices(p: Record<string, unknown>, key: string, type: string, size: number): number[] {
  const v = p[key];
  if (!Array.isArray(v)) fail(`${type}.payload.${key}`, '배열이 아니다');
  return v.map((x, k) => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x >= size) {
      fail(`${type}.payload.${key}[${k}]`, `결과 번호 0..${size - 1} 밖이다`);
    }
    return x;
  });
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) fail(`${event.type}.payload`, '객체가 아니다');
  return p as Record<string, unknown>;
}

export const conditionalNarrowingScene: ScenePlan<ConditionalNarrowingScene> = {
  initial(initialData: unknown): ConditionalNarrowingScene {
    const data = narrowConditionalNarrowingData(initialData);
    const outcomes = enumerateOutcomes(data.faces);
    return {
      faces: data.faces,
      outcomes,
      symbolA: data.eventA.symbol,
      symbolB: data.eventB.symbol,
      sumAtLeast: data.eventA.sumAtLeast,
      firstAtLeast: data.eventB.firstAtLeast,
      markedA: null,
      shareA: null,
      departed: null,
      departedA: null,
      world: outcomes.length,
      recounted: null,
      shareGiven: null,
      step: { kind: 'world' },
    };
  },

  reduce(scene: ConditionalNarrowingScene, event: FacetRuntimeEvent): ConditionalNarrowingScene {
    const size = scene.outcomes.length;
    switch (event.type) {
      case 'markA': {
        const p = payloadOf(event);
        const members = indices(p, 'members', 'markA', size);
        const count = num(p, 'count', 'markA');
        const total = num(p, 'total', 'markA');
        if (count !== members.length) fail('markA.payload.count', 'members 의 길이와 다르다');
        if (total !== scene.world) fail('markA.payload.total', `지금 세상 크기 ${scene.world} 와 다르다`);
        return {
          ...scene,
          markedA: members,
          shareA: { num: count, den: total, pct: num(p, 'pct', 'markA') },
          step: { kind: 'markA', members },
        };
      }
      case 'leave': {
        if (scene.markedA === null) fail('leave', 'markA 보다 먼저 왔다');
        const p = payloadOf(event);
        const leaving = indices(p, 'leaving', 'leave', size);
        const leavingA = indices(p, 'leavingA', 'leave', size);
        const from = num(p, 'from', 'leave');
        const to = num(p, 'to', 'leave');
        if (from !== scene.world) fail('leave.payload.from', `지금 세상 크기 ${scene.world} 와 다르다`);
        if (from - leaving.length !== to) fail('leave.payload.to', 'from 에서 떠나는 수를 뺀 값과 다르다');
        const marked = scene.markedA;
        for (const [k, i] of leavingA.entries()) {
          if (!marked.includes(i)) fail(`leave.payload.leavingA[${k}]`, 'A 로 표시된 결과가 아니다');
          if (!leaving.includes(i)) fail(`leave.payload.leavingA[${k}]`, '떠나는 결과가 아니다');
        }
        return {
          ...scene,
          departed: leaving,
          departedA: leavingA,
          world: to,
          step: { kind: 'leave', leaving, leavingA, from, to },
        };
      }
      case 'recount': {
        if (scene.departed === null) fail('recount', 'leave 보다 먼저 왔다');
        const p = payloadOf(event);
        const members = indices(p, 'members', 'recount', size);
        const count = num(p, 'count', 'recount');
        const total = num(p, 'total', 'recount');
        if (count !== members.length) fail('recount.payload.count', 'members 의 길이와 다르다');
        if (total !== scene.world) fail('recount.payload.total', `남은 세상 크기 ${scene.world} 와 다르다`);
        const gone = scene.departed;
        for (const [k, i] of members.entries()) {
          if (gone.includes(i)) fail(`recount.payload.members[${k}]`, '이미 떠난 결과다');
        }
        return { ...scene, recounted: members, step: { kind: 'recount', members } };
      }
      case 'answer': {
        if (scene.recounted === null || scene.shareA === null) fail('answer', 'recount 보다 먼저 왔다');
        const p = payloadOf(event);
        const n = num(p, 'num', 'answer');
        const d = num(p, 'den', 'answer');
        if (n !== scene.recounted.length) fail('answer.payload.num', '다시 센 A 의 수와 다르다');
        if (d !== scene.world) fail('answer.payload.den', '남은 세상 크기와 다르다');
        if (num(p, 'prevNum', 'answer') !== scene.shareA.num) fail('answer.payload.prevNum', '앞의 분자와 다르다');
        if (num(p, 'prevDen', 'answer') !== scene.shareA.den) fail('answer.payload.prevDen', '앞의 분모와 다르다');
        return {
          ...scene,
          shareGiven: { num: n, den: d, pct: num(p, 'pct', 'answer') },
          step: { kind: 'answer' },
        };
      }
      default:
        throw new Error(`conditional-narrowing scene: 모르는 이벤트 ${event.type}`);
    }
  },
};
