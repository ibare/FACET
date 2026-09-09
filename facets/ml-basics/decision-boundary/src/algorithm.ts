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
 * 화면에 뜨는 z · p · 격자 확률은 전부 여기서 구조(무게 · 치우침 · 점 · 격자)
 * 에서 셈해 내보낸다. 선언에는 파생값이 하나도 없다.
 *
 * ── 이벤트 (전부 이 facet 고유. silent 는 없다) ─────────────────────────
 *
 *   point-probed      { index, total, x, y, z, p }
 *       target `point:<index>`. 점 하나에 확률을 매긴다. 평면의 점이 확률
 *       색으로 물들고, 같은 값이 오른쪽 확률자로 날아가 꽂힌다.
 *
 *   spread-noted      { low, high, threshold }
 *       여덟 확률이 두 끝으로 뭉쳤음을 짚는다. low 는 threshold 아래에서
 *       가장 큰 확률, high 는 위에서 가장 작은 확률. 그 사이는 비어 있다.
 *
 *   field-scanned     { col0, cols, rows, values }
 *       격자의 col0 열부터 cols 개 열을 훑는다. values 는 그 구간의 확률을
 *       열 우선으로 편 것 — 길이 cols*rows, values[i * rows + row].
 *
 *   crossing-marked   { cells, total }
 *       확률이 반을 넘나드는 칸. cells 는 격자 전체 기준 평탄 색인
 *       (col * rows + row) 의 오름차순. total 은 격자 칸의 총수.
 *
 *   boundary-revealed { wx, wy, bias }
 *       그 칸들을 잇는 선. wx·x + wy·y + bias = 0 이 곧 p = 0.5 다.
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

/** 확률이 반이 되는 자리가 곧 경계다. */
const HALF = 0.5;

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** 한 걸음을 여는 문. true 면 나아가고, false 면 취소된 것이라 멈춘다. */
type Gate = () => Promise<boolean>;

export async function decisionBoundary(
  base: FacetContext<DecisionBoundaryData>,
): Promise<void> {
  const ctx = base as ReactiveContext<DecisionBoundaryData>;
  const d = ctx.data;
  const { cols, rows } = d.grid;
  const span = d.domain.max - d.domain.min;

  const score = (x: number, y: number): number =>
    d.weights.x * x + d.weights.y * y + d.bias;

  // 격자의 확률 — 한 번 셈해 두고 물결마다 잘라 보낸다.
  const field: number[] = new Array<number>(cols * rows);
  for (let c = 0; c < cols; c += 1) {
    const gx = d.domain.min + ((c + 0.5) / cols) * span;
    for (let r = 0; r < rows; r += 1) {
      const gy = d.domain.min + ((r + 0.5) / rows) * span;
      field[c * rows + r] = sigmoid(score(gx, gy));
    }
  }

  // 반을 "넘나드는" 칸 — 이웃과 반대편에 있는 칸. 임의의 여유폭으로 고르지
  // 않는다. 넘나듦은 이웃 사이의 사실이지 사람이 정하는 굵기가 아니다.
  const marked = new Set<number>();
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const here = field[c * rows + r]! >= HALF;
      if (c + 1 < cols && (field[(c + 1) * rows + r]! >= HALF) !== here) {
        marked.add(c * rows + r);
        marked.add((c + 1) * rows + r);
      }
      if (r + 1 < rows && (field[c * rows + r + 1]! >= HALF) !== here) {
        marked.add(c * rows + r);
        marked.add(c * rows + r + 1);
      }
    }
  }
  const crossing = [...marked].sort((a, b) => a - b);

  /** 한 회차 전체. 자동 재생과 되짚기가 같은 걸음을 밟도록 문만 갈아 끼운다. */
  const playOnce = async (gate: Gate): Promise<void> => {
    for (let i = 0; i < d.points.length; i += 1) {
      if (!(await gate())) return;
      const pt = d.points[i]!;
      const z = score(pt.x, pt.y);
      await ctx.emit({
        type: 'point-probed',
        target: `point:${i}`,
        payload: { index: i, total: d.points.length, x: pt.x, y: pt.y, z, p: sigmoid(z) },
      });
    }

    if (!(await gate())) return;
    let low = 0;
    let high = 1;
    for (const pt of d.points) {
      const p = sigmoid(score(pt.x, pt.y));
      if (p < HALF) low = Math.max(low, p);
      else high = Math.min(high, p);
    }
    await ctx.emit({ type: 'spread-noted', payload: { low, high, threshold: HALF } });

    const per = Math.max(1, Math.ceil(cols / d.grid.waves));
    for (let col0 = 0; col0 < cols; col0 += per) {
      if (!(await gate())) return;
      const n = Math.min(per, cols - col0);
      await ctx.emit({
        type: 'field-scanned',
        payload: { col0, cols: n, rows, values: field.slice(col0 * rows, (col0 + n) * rows) },
      });
    }

    if (!(await gate())) return;
    await ctx.emit({
      type: 'crossing-marked',
      payload: { cells: crossing, total: cols * rows },
    });

    if (!(await gate())) return;
    await ctx.emit({
      type: 'boundary-revealed',
      payload: { wx: d.weights.x, wy: d.weights.y, bias: d.bias },
    });

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
