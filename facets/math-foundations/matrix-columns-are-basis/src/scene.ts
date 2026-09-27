/**
 * 장면 — 규칙에서 행렬을 한 열씩 채운다.
 *
 * 바탕: 규칙 · 시험 점 (initialData 에서 베낀다)
 * 자취: 규칙이 옮긴 기저(`sent`) · 채워진 열(`cols`) · 시험 점의 두 도착(`byRule` · `byMatrix`)
 * 이번 걸음: `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readColumnsData, readVec2, sameVec, type RuleId, type Vec2 } from './algorithm.js';

export type SentBasis = { from: Vec2; to: Vec2 };

export type ColumnsStep =
  | { kind: 'start' }
  | { kind: 'rule'; basis: number }
  | { kind: 'fill'; col: number }
  | { kind: 'testRule' }
  | { kind: 'testMatrix' };

export type ColumnsScene = {
  rule: RuleId;
  test: Vec2;
  /** 규칙이 옮긴 기저 — 칸 i 는 기저 i. 아직이면 null */
  sent: readonly (SentBasis | null)[];
  /** 행렬의 열 — 칸 c 는 c 열 (위 칸, 아래 칸). 비었으면 null */
  cols: readonly (Vec2 | null)[];
  byRule: Vec2 | null;
  byMatrix: Vec2 | null;
  same: boolean | null;
  step: ColumnsStep;
};

const DIM = 2;

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`${event.type}: payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

function readIndex(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= DIM) {
    throw new Error(`${path}: 0 이상 ${DIM} 미만 정수가 아니다 (${String(v)})`);
  }
  return v;
}

function unitVec(i: number): Vec2 {
  return [i === 0 ? 1 : 0, i === 1 ? 1 : 0];
}

export const matrixColumnsAreBasisScene: ScenePlan<ColumnsScene> = {
  initial(initialData: unknown): ColumnsScene {
    const data = readColumnsData(initialData);
    return {
      rule: data.rule,
      test: [data.test[0], data.test[1]],
      sent: [null, null],
      cols: [null, null],
      byRule: null,
      byMatrix: null,
      same: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: ColumnsScene, event: FacetRuntimeEvent): ColumnsScene {
    switch (event.type) {
      case 'rule-apply': {
        const p = payloadOf(event);
        const i = readIndex(p.basis, 'rule-apply.payload.basis');
        const from = readVec2(p.from, 'rule-apply.payload.from');
        const to = readVec2(p.to, 'rule-apply.payload.to');
        if (scene.sent[i] !== null) throw new Error(`rule-apply: 기저 ${i} 는 이미 옮겼다`);
        if (i > 0 && scene.cols[i - 1] === null) {
          throw new Error(`rule-apply: 기저 ${i} 앞에서 ${i - 1} 열이 아직 비었다`);
        }
        if (!sameVec(from, unitVec(i))) throw new Error(`rule-apply.payload.from: 기저 ${i} 가 아니다`);
        const sent = scene.sent.map((s, k) => (k === i ? { from, to } : s));
        return { ...scene, sent, step: { kind: 'rule', basis: i } };
      }
      case 'column-fill': {
        const p = payloadOf(event);
        const c = readIndex(p.col, 'column-fill.payload.col');
        const value = readVec2(p.value, 'column-fill.payload.value');
        const s = scene.sent[c];
        if (s === null || s === undefined) throw new Error(`column-fill: 기저 ${c} 를 아직 옮기지 않았다`);
        if (scene.cols[c] !== null) throw new Error(`column-fill: ${c} 열은 이미 찼다`);
        if (!sameVec(value, s.to)) throw new Error(`column-fill.payload.value: 기저 ${c} 가 간 자리와 다르다`);
        const cols = scene.cols.map((v, k) => (k === c ? value : v));
        return { ...scene, cols, step: { kind: 'fill', col: c } };
      }
      case 'test-rule': {
        const p = payloadOf(event);
        const from = readVec2(p.from, 'test-rule.payload.from');
        const to = readVec2(p.to, 'test-rule.payload.to');
        if (scene.cols.some((v) => v === null)) throw new Error('test-rule: 행렬이 아직 다 차지 않았다');
        if (!sameVec(from, scene.test)) throw new Error('test-rule.payload.from: 시험 점이 아니다');
        if (scene.byRule !== null) throw new Error('test-rule: 이미 옮겼다');
        return { ...scene, byRule: to, step: { kind: 'testRule' } };
      }
      case 'test-matrix': {
        const p = payloadOf(event);
        const from = readVec2(p.from, 'test-matrix.payload.from');
        const to = readVec2(p.to, 'test-matrix.payload.to');
        if (typeof p.same !== 'boolean') throw new Error('test-matrix.payload.same: 참거짓이 아니다');
        if (scene.byRule === null) throw new Error('test-matrix: 규칙으로 먼저 옮겨야 한다');
        if (!sameVec(from, scene.test)) throw new Error('test-matrix.payload.from: 시험 점이 아니다');
        if (p.same !== sameVec(to, scene.byRule)) throw new Error('test-matrix.payload.same: 두 자리와 맞지 않는다');
        return { ...scene, byMatrix: to, same: p.same, step: { kind: 'testMatrix' } };
      }
      default:
        throw new Error(`matrixColumnsAreBasisScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
