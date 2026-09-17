/**
 * 결정 경계 — 조각(piece).
 *
 * 질문: 확률로 답하는 모델은 어디서 "이쪽" 과 "저쪽" 을 가르는가.
 *
 * 동사는 **드러난다** 이고, 순서 자체가 논증이다. 선을 먼저 긋고 점을 칠하는
 * 것이 아니라 그 반대다 — 점마다 확률을 매기고, 여덟 점만으로는 반이 되는
 * 자리를 못 짚는다는 것을 보이고, 평면의 모든 자리에 같은 것을 물은 다음,
 * 확률이 반을 넘나드는 칸을 표시하고, **마지막에** 그것을 잇는다.
 *
 * 무게와 치우침은 고정이다. 이 조각은 학습을 보이지 않는다.
 *
 *   z = wx·x + wy·y + bias
 *   p = 1 / (1 + e^(−z))
 *
 * ── 이 파일이 내주는 것 (장면이 부른다)
 *
 * 화면에 뜨는 z · p · 격자 농도 · 넘나드는 칸은 전부 아래 순수 함수를 지난다
 * (프로토콜 4 절의 B 갈래). 발신이 그 수를 실어 오면 같은 물음에 답이 둘이
 * 되고 언젠가 갈린다 — 그래서 **일곱 발신 모두 payload 가 비어 있다.**
 *
 * 내주어도 조각이 피하려는 셈을 장면이 대신 하게 되지 않는다. 이 조각의
 * 알고리즘은 **묻는 순서**이고 그것은 아래 `playOnce` 에 그대로 남아 있다.
 * 내준 것은 무게·치우침만 있으면 정해지는 잣대라 떼어 내도 주장이 남는다.
 *
 * ── 이벤트 (전부 이 facet 고유. silent 는 없다) ─────────────────────────
 *
 *   point-probed      {}
 *       점 하나에 확률을 매긴다. 평면의 점이 확률
 *       색으로 물들고, 같은 값이 오른쪽 확률자로 날아가 꽂힌다.
 *       몇 번째 점인지 싣지 않는다 — 점은 올 때마다 하나씩 쌓이므로 차례는
 *       장면이 센다. 그 점의 z · p 도 `decisionProbability` 가 낸다.
 *
 *   spread-noted      {}
 *       여덟 확률이 두 끝으로 뭉쳤음을 짚는다. 빈 구간의 두 끝은 이미 꽂힌
 *       확률들에서 나오므로 장면이 셈한다.
 *
 *   field-scanned     {}
 *       격자의 다음 물결을 훑는다. 어느 열부터 몇 열인지는 `decisionWaveSize`
 *       하나가 정하고, 그 구간의 확률은 `decisionField` 가 낸다.
 *
 *   crossing-marked   {}
 *       확률이 반을 넘나드는 칸을 표시한다. 어느 칸인지는
 *       `decisionCrossings` 가 낸다.
 *
 *   boundary-revealed {}
 *       그 칸들을 잇는 선. wx·x + wy·y + bias = 0 이 곧 p = 0.5 다. 무게와
 *       치우침은 선언에 있으므로 싣지 않는다.
 *
 *   rewind            {}
 *       처음 상태로 되감는다. 자동 재생이 끝난 뒤 처음 누르는 advance 가
 *       보내며, 그 뒤 곧바로 첫 걸음이 이어진다.
 *
 *   done              {}
 *       마침.
 *
 * 메트릭은 없다 (조각은 셀 것이 없다, S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DecisionBoundaryPoint = { x: number; y: number };

export type DecisionBoundaryData = {
  type: string;
  /** 고정 무게. 학습하지 않는다. */
  weights: { x: number; y: number };
  /** 고정 치우침. */
  bias: number;
  points: DecisionBoundaryPoint[];
  /** 질문을 던지는 입력 공간의 범위 (x · y 공통). 화면 좌표가 아니다. */
  domain: { min: number; max: number };
  /** 평면 전체에 물을 때의 격자 해상도와, 그것을 몇 물결로 나눠 훑을지. */
  grid: { cols: number; rows: number; waves: number };
  stepMs: number;
};

/**
 * 확률이 반이 되는 자리가 곧 경계다.
 *
 * 잣대는 여기 하나다 — 장면도 그리는 쪽도 이 값을 지나 쓴다. 두 군데서 0.5 를
 * 적으면 문턱을 옮기는 날 한쪽만 따라온다.
 */
export const DECISION_HALF = 0.5;

/** 점수를 내는 모델. 선언이 주는 것이 전부이고 학습하지 않는다. */
export type DecisionModel = {
  weights: { x: number; y: number };
  bias: number;
};

/** 그 자리의 점수. 클수록 위쪽 진영이다. */
export function decisionScore(model: DecisionModel, x: number, y: number): number {
  return model.weights.x * x + model.weights.y * y + model.bias;
}

/** 그 자리의 확률. 화면에 뜨는 모든 p 가 이 한 함수를 지난다. */
export function decisionProbability(model: DecisionModel, x: number, y: number): number {
  return 1 / (1 + Math.exp(-decisionScore(model, x, y)));
}

/**
 * 격자 칸 가운데의 확률, 열 우선 (`col * rows + row`).
 *
 * 새 배열을 낸다 — 장면이 참조로 쥐어도 바깥이 제자리에서 고칠 것이 없다
 * (S-scene).
 */
export function decisionField(
  model: DecisionModel,
  domain: { min: number; max: number },
  grid: { cols: number; rows: number },
): number[] {
  const span = domain.max - domain.min;
  const out: number[] = new Array<number>(grid.cols * grid.rows);
  for (let c = 0; c < grid.cols; c += 1) {
    const gx = domain.min + ((c + 0.5) / grid.cols) * span;
    for (let r = 0; r < grid.rows; r += 1) {
      const gy = domain.min + ((r + 0.5) / grid.rows) * span;
      out[c * grid.rows + r] = decisionProbability(model, gx, gy);
    }
  }
  return out;
}

/**
 * 반을 "넘나드는" 칸 — 이웃과 반대편에 있는 칸. 평탄 색인의 오름차순.
 *
 * 임의의 여유폭으로 고르지 않는다. 넘나듦은 이웃 사이의 사실이지 사람이 정하는
 * 굵기가 아니다.
 */
export function decisionCrossings(
  field: readonly number[],
  cols: number,
  rows: number,
): number[] {
  const marked = new Set<number>();
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const here = (field[c * rows + r] ?? DECISION_HALF) >= DECISION_HALF;
      if (c + 1 < cols && ((field[(c + 1) * rows + r] ?? DECISION_HALF) >= DECISION_HALF) !== here) {
        marked.add(c * rows + r);
        marked.add((c + 1) * rows + r);
      }
      if (r + 1 < rows && ((field[c * rows + r + 1] ?? DECISION_HALF) >= DECISION_HALF) !== here) {
        marked.add(c * rows + r);
        marked.add(c * rows + r + 1);
      }
    }
  }
  return [...marked].sort((a, b) => a - b);
}

/**
 * 한 물결이 훑는 열의 수.
 *
 * **자르는 잣대는 여기 하나다** — 걸음을 내는 쪽과 화면을 세우는 쪽이 각자
 * 자르면 훑은 열과 발신 수가 갈린다 (프로토콜 4 절).
 */
export function decisionWaveSize(cols: number, waves: number): number {
  return Math.max(1, Math.ceil(cols / Math.max(1, waves)));
}

/** 한 걸음을 여는 문. true 면 나아가고, false 면 취소된 것이라 멈춘다. */
type Gate = () => Promise<boolean>;

export async function decisionBoundary(
  base: FacetContext<DecisionBoundaryData>,
): Promise<void> {
  const ctx = base as ReactiveContext<DecisionBoundaryData>;
  const d = ctx.data;
  const { cols } = d.grid;
  const per = decisionWaveSize(cols, d.grid.waves);

  /** 한 회차 전체. 자동 재생과 되짚기가 같은 걸음을 밟도록 문만 갈아 끼운다. */
  const playOnce = async (gate: Gate): Promise<void> => {
    for (let i = 0; i < d.points.length; i += 1) {
      if (!(await gate())) return;
      await ctx.emit({ type: 'point-probed' });
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'spread-noted', payload: {} });

    for (let col0 = 0; col0 < cols; col0 += per) {
      if (!(await gate())) return;
      await ctx.emit({ type: 'field-scanned', payload: {} });
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'crossing-marked', payload: {} });

    if (!(await gate())) return;
    await ctx.emit({ type: 'boundary-revealed', payload: {} });

    if (!(await gate())) return;
    await ctx.emit({ type: 'done', payload: {} });
  };

  // 1. 자동 재생 — 걸음마다 stepMs 만큼 쉰다.
  await playOnce(async () => (await ctx.sleep(d.stepMs)) && !ctx.cancelled);

  // 2. 되짚기 — 자동 재생이 끝난 뒤 advance 로 한 걸음씩.
  for (;;) {
    if (ctx.cancelled) return;
    const input = await ctx.waitForInput();
    if (input.type !== 'advance') continue;
    if (ctx.cancelled) return;

    await ctx.emit({ type: 'rewind', payload: {} });

    // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다. 되감기 직후의
    // 첫 문만 그냥 통과시켜 첫 걸음까지 보인다 (S-piece).
    let passFirst = true;
    await playOnce(async () => {
      if (passFirst) {
        passFirst = false;
        return !ctx.cancelled;
      }
      for (;;) {
        if (ctx.cancelled) return false;
        const ev = await ctx.waitForInput();
        if (ev.type === 'advance') return !ctx.cancelled;
      }
    });
  }
}
