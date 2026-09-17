/**
 * 최소제곱 — 벗어남을 그냥 더하면 왜 안 되는가. (조각)
 *
 * 부호를 지닌 잔차는 서로를 지운다. 위로 벗어난 만큼과 아래로 벗어난 만큼이
 * 만나 0 이 되므로, **엉터리 직선과 좋은 직선이 똑같이 0 을 낸다.** 제곱한
 * 값들은 서로를 지우지 못하고 쌓이며, 그때 비로소 셋이 갈린다.
 *
 * 걸음의 순서가 곧 논증이다 — 셋 다 0 임을 먼저 보이고(문제), 재는 자를
 * 길이에서 넓이로 바꾼 뒤(장치), 셋이 갈리는 것을 보인다(결과).
 *
 * ── 이 파일은 박자만 잡는다
 *
 * 잔차도 제곱도 두 합도 여기서 셈하지 않는다. 화면에 뜨는 수는 전부 `scene.ts` 의
 * `readingsOf` 한 함수에서 나오고, 그림의 막대·탑·표기·판정이 그 하나를 지난다.
 * 여기서 한 번 더 세어 발신에 실으면 **같은 물음에 답이 둘**이 되어 언젠가 갈린다
 * (`tasks/scene-migration-protocol.md` 4 절 "payload 가 친절하면 오히려 위험하다").
 *
 * 사양이 준 대조값(26 / 11 / 6)은 견주는 용도이지 어디에도 박아 넣지 않는다.
 *
 * ── 이벤트 (전부 facet 고유. 표준 어휘로는 "재는 자를 바꾼다" 를 말할 수 없다)
 *
 *   line-focus     {}   한 직선을 짚는다. **어느 직선인지 싣지 않는다** — 발신이
 *                       오는 차례가 곧 직선이고, 장면이 담긴 수로 센다.
 *   signed-fold    {}   짚은 직선의 잔차를 부호를 지닌 채 레인으로 옮겨 쌓는다.
 *   measure-shift  {}   재는 자를 길이에서 넓이로 바꾼다. 쌓인 것을 비우고
 *                       기준선을 바닥으로 내려 제곱이 올라설 자리를 낸다.
 *   square-fold    {}   같은 잔차가 다시 서고, 제 길이를 한 변으로 하는 정사각형으로
 *                       펼쳐졌다가 레인으로 부어진다. 벗어남이 서는 것과 제곱으로
 *                       펼쳐지는 것을 한 몸짓으로 묶은 것은 "같은 벗어남을 다르게
 *                       잰다" 가 한 동작이기 때문이다.
 *   verdict        {}   제곱이 가장 적게 쌓인 직선을 짚는다. **어느 직선인지
 *                       싣지 않는다** — 제곱합의 최솟값은 탑을 세우는 바로 그
 *                       배열에서 나온다.
 *   rewind         {}   처음 화면으로 되감는다. 자동 재생이 끝난 뒤 `advance` 를
 *                       처음 눌렀을 때만 나간다.
 *
 * silent 이벤트는 없다. 모두 화면이 바뀌는 걸음이다.
 *
 * `done` 은 내보내지 않는다. 이 조각은 자동 재생을 마친 뒤에도 끝나지 않고
 * `advance` 를 기다리는 자리에 머문다 — 끝났다고 알릴 지점이 없다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LeastSquaresPoint = { x: number; y: number };

/** 견줄 직선. 학습하지 않는다 — 계수는 선언이 준다. */
export type LeastSquaresLine = { slope: number; intercept: number };

export type LeastSquaresData = {
  type: string;
  points: LeastSquaresPoint[];
  lines: LeastSquaresLine[];
  /** 걸음 간격. 읽을 시간을 주는 저작 결정이라 선언에 둔다 (S-piece). */
  stepMs: number;
};

const FALLBACK_STEP_MS = 900;

export const leastSquares = async (ctx: FacetContext<LeastSquaresData>): Promise<void> => {
  const rc = ctx as ReactiveContext<LeastSquaresData>;
  const lines = rc.data.lines;
  const stepMs = typeof rc.data.stepMs === 'number' ? rc.data.stepMs : FALLBACK_STEP_MS;

  /** 한 걸음을 나아가도 되는지 묻는다. false 면 취소된 것이니 즉시 손을 뗀다. */
  type Gate = () => Promise<boolean>;

  const autoGate: Gate = async () => await rc.sleep(stepMs);

  /**
   * 손으로 짚는 걸음.
   *
   * 자동 재생이 끝난 뒤 처음 누르는 `advance` 는 되감기만 하고 멈추면 안 된다 —
   * 눌러도 반응이 없는 것으로 읽힌다. 그래서 되감기 직후의 첫 문은 그냥
   * 통과시켜 첫 걸음까지 보인다 (S-piece).
   */
  function handGate(): Gate {
    let firstPassed = false;
    return async () => {
      if (!firstPassed) {
        firstPassed = true;
        return !rc.cancelled;
      }
      for (;;) {
        if (rc.cancelled) return false;
        const input = await rc.waitForInput();
        if (input.type === 'advance') return !rc.cancelled;
      }
    };
  }

  async function argue(gate: Gate): Promise<void> {
    // 1) 문제 — 부호 있는 합은 셋을 가르지 못한다.
    for (let k = 0; k < lines.length; k += 1) {
      if (!(await gate())) return;
      await rc.emit({ type: 'line-focus', payload: {} });
      if (!(await gate())) return;
      await rc.emit({ type: 'signed-fold', payload: {} });
    }

    // 2) 장치 — 재는 자를 길이에서 넓이로 바꾼다.
    if (!(await gate())) return;
    await rc.emit({ type: 'measure-shift', payload: {} });

    // 3) 결과 — 제곱은 서로를 지우지 못한다.
    for (let k = 0; k < lines.length; k += 1) {
      if (!(await gate())) return;
      await rc.emit({ type: 'square-fold', payload: {} });
    }

    if (!(await gate())) return;
    await rc.emit({ type: 'verdict', payload: {} });
  }

  await argue(autoGate);

  // 자동 재생이 끝났다. 이제 곱씹으며 한 걸음씩 짚어 볼 수 있다.
  for (;;) {
    if (rc.cancelled) return;
    const input = await rc.waitForInput();
    if (input.type !== 'advance') continue;
    if (rc.cancelled) return;
    await rc.emit({ type: 'rewind', payload: {} });
    await argue(handGate());
  }
};
