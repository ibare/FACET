/**
 * 잔차(residual) — 선에서 벗어난 만큼. (조각)
 *
 * 질문: 직선이 한 점에서 얼마나 틀렸는지는 무엇으로 재는가.
 *
 * 재는 방향은 점에서 직선까지의 **최단거리(수선)** 가 아니라 **세로(y)** 다.
 * 맞히려는 것이 y 이므로 재는 것도 y 방향의 어긋남이다. 걸음은 그 대비가 곧
 * 논증이 되도록 짠다 — 한 점을 짚고 → 최단거리를 먼저 보여 주고 → 그것을 세로로
 * 돌려세운 뒤 → 나머지 점도 같은 방식으로 내려꽂는다.
 *
 * 직선은 고정이다. 이 조각은 계수를 학습하지 않는다.
 *
 * ── 이벤트 (전부 step boundary. silent 는 없다)
 *
 * | type                | target      | payload                                    |
 * | ------------------- | ----------- | ------------------------------------------ |
 * | highlight           | `index:<i>` | 없음                                        |
 * | probe-perpendicular | `index:<i>` | 없음                                        |
 * | probe-turn          | `index:<i>` | `{ predicted: number; residual: number }`   |
 * | residual-drop       | `index:<i>` | `{ predicted: number; residual: number }`   |
 * | rewind              | 없음         | 없음                                        |
 * | done                | 없음         | 없음                                        |
 *
 * `predicted` 는 직선이 그 x 에서 내놓는 값, `residual` 은 `y - predicted` 다.
 * 화면에 뜨는 수는 전부 여기서 셈해 실어 보낸다 — view 가 다시 셈하지 않는다.
 *
 * 메트릭은 없다 (조각은 셀 것이 없다 — S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ResidualPoint = { x: number; y: number };

export type ResidualDistanceData = {
  type: 'residual-distance';
  /** 고정된 직선 y = slope·x + intercept. 학습하지 않는다. */
  slope: number;
  intercept: number;
  /** 관측점. 잔차는 이 구조에서 셈한다. */
  points: ResidualPoint[];
  /** 걸음 간격. 읽을 시간을 주는 것은 저작 결정이라 선언에 둔다 (S-piece). */
  stepMs: number;
};

export const residualDistanceAlgorithm = async (
  base: FacetContext<ResidualDistanceData>,
): Promise<void> => {
  const ctx = base as ReactiveContext<ResidualDistanceData>;
  const { slope, intercept, points, stepMs } = ctx.data;

  /** 손으로 짚는 구간인가. 자동 재생이 끝나고 advance 를 처음 받으면 켜진다. */
  let manual = false;
  /** 되감기 직후의 첫 문만 그냥 통과시킨다 — 첫 advance 는 첫 걸음까지 간다 (S-piece). */
  let freeGate = false;

  const predict = (x: number): number => slope * x + intercept;

  /** 걸음 사이의 문. 자동이면 쉬고, 손으로 짚는 구간이면 advance 를 기다린다. */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (!manual) return ctx.sleep(stepMs);
    if (freeGate) {
      freeGate = false;
      return true;
    }
    for (;;) {
      if (ctx.cancelled) return false;
      const input = await ctx.waitForInput();
      if (input.type !== 'advance') continue;
      return !ctx.cancelled;
    }
  }

  /** 한 회차. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  async function play(): Promise<boolean> {
    if (points.length === 0) return false;
    const first = points[0];

    // 1. 한 점을 짚는다. 이 점에서 직선은 얼마나 틀렸는가.
    if (!(await gate())) return false;
    await ctx.emit({ type: 'highlight', target: 'index:0' });

    // 2. 최단거리 후보를 먼저 보인다 — 직선에 직각으로 닿는 자리.
    if (!(await gate())) return false;
    await ctx.emit({ type: 'probe-perpendicular', target: 'index:0' });

    // 3. 그것을 세로로 돌려세운다. 여기서부터 재는 것이 잔차다.
    if (!(await gate())) return false;
    const firstPredicted = predict(first.x);
    await ctx.emit({
      type: 'probe-turn',
      target: 'index:0',
      payload: { predicted: firstPredicted, residual: first.y - firstPredicted },
    });

    // 4. 나머지 점도 같은 방식으로 내려꽂는다. 걸음 수는 점 목록이 정한다.
    for (let i = 1; i < points.length; i += 1) {
      if (ctx.cancelled) return false;
      const p = points[i];
      if (!(await gate())) return false;
      const predicted = predict(p.x);
      await ctx.emit({
        type: 'residual-drop',
        target: `index:${i}`,
        payload: { predicted, residual: p.y - predicted },
      });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done' });
    return true;
  }

  if (!(await play())) return;

  // 자동 재생이 끝났다. 이제부터는 손으로 짚는다 — 누를 때마다 처음부터 한 걸음씩.
  for (;;) {
    if (ctx.cancelled) return;
    const input = await ctx.waitForInput();
    if (input.type !== 'advance') continue;
    manual = true;
    freeGate = true;
    await ctx.emit({ type: 'rewind' });
    if (!(await play())) return;
  }
};
