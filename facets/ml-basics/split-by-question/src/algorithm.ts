/**
 * splitByQuestion — 분기 기준. 질문 하나로 둘로 가른다.
 *
 * 동사는 **미끄러진다 → 갈아 세운다** 다. 자름선 하나가 한 축 위를 옮겨 다니며
 * 양쪽에 무엇이 담기는지 바꾸는데, 아무리 옮겨도 양쪽이 늘 반반이다. 축을 갈아
 * 세우면 첫 자리에서 한 번에 갈린다.
 *
 * 논증의 순서는 "안 되는 것을 끝까지 해 본 뒤 축을 바꾼다" 이므로, 가로축의
 * 자름 자리를 전부 소진한 뒤에야 세로축으로 넘어간다. 좋은 답을 먼저 보이지
 * 않는다.
 *
 * 셈은 전부 여기서 한다 — 양쪽에 이름표가 몇 개씩 담기는지는 점과 기준값에서
 * 직접 세며, 화면에 박아 넣은 수가 아니다.
 *
 * ── 이벤트 (전부 facet 고유. 시각 변화가 있는 step boundary 라 silent 없음)
 *
 *   axis-picked      { axis: 'x' | 'y' }
 *                    자름선이 설 축을 고른다. 'y' 는 갈아 세우는 회전이다.
 *
 *   cut-tried        { axis: 'x' | 'y'; threshold: number;
 *                      low:  { a: number; b: number };
 *                      high: { a: number; b: number };
 *                      pure: boolean }
 *                    자름선을 threshold 로 옮기고 양쪽을 센다. low 는 기준 미만,
 *                    high 는 기준 이상. a 는 classes[0], b 는 classes[1] 의 수.
 *                    pure 는 양쪽 모두 한 이름표만 담긴 상태.
 *
 *   axis-exhausted   { axis: 'x' | 'y'; tried: number }
 *                    그 축의 자름 자리를 다 써 보았는데도 갈리지 않았다.
 *
 *   rewind           payload 없음
 *                    자동 재생이 끝난 뒤 advance 로 처음으로 되돌아간다.
 *
 *   done             payload 없음. 표준 이벤트.
 *
 * ── 메트릭
 *
 *   없다. 조각이므로 ctx.metric 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SplitPoint = {
  x: number;
  y: number;
  /** 이름표. classes 중 하나. */
  label: string;
};

export type SplitByQuestionData = {
  type: 'split-by-question';
  points: SplitPoint[];
  /** 이름표 두 종. 앞이 아래(low) 쪽에 모인 것. */
  classes: [string, string];
  /** 가로축에서 시도할 자름 자리. */
  xCuts: number[];
  /** 세로축에서 시도할 자름 자리. */
  yCuts: number[];
  /** 걸음 간격 (S-piece). */
  stepMs: number;
};

export type SideTally = { a: number; b: number };

/** 한 자름 자리에서 양쪽에 무엇이 몇 개씩 담기는지 센다. */
function tally(
  points: SplitPoint[],
  classes: [string, string],
  axis: 'x' | 'y',
  threshold: number,
): { low: SideTally; high: SideTally } {
  const low: SideTally = { a: 0, b: 0 };
  const high: SideTally = { a: 0, b: 0 };
  for (const p of points) {
    const value = axis === 'x' ? p.x : p.y;
    const bin = value < threshold ? low : high;
    if (p.label === classes[0]) bin.a += 1;
    else bin.b += 1;
  }
  return { low, high };
}

/** 한쪽에 한 이름표만 담겼는가. */
function oneLabelOnly(side: SideTally): boolean {
  return side.a === 0 || side.b === 0;
}

export async function splitByQuestionAlgorithm(
  ctx: FacetContext<SplitByQuestionData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<SplitByQuestionData>;
  const { points, classes, xCuts, yCuts, stepMs } = rc.data;

  /** 자동 재생을 마치고 advance 로 되짚는 중인가. */
  let manual = false;
  /** 되감은 직후의 첫 문은 그냥 지난다 (아래 gate 주석). */
  let passFirstGate = false;

  type SweepResult = 'pure' | 'exhausted' | 'cancelled';

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  async function gate(): Promise<boolean> {
    if (rc.cancelled) return false;
    if (!manual) return rc.sleep(stepMs);
    // 자동 재생이 끝난 뒤 처음 누르는 advance 는 되감고 **첫 걸음까지** 보인다.
    // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
    if (passFirstGate) {
      passFirstGate = false;
      return true;
    }
    for (;;) {
      if (rc.cancelled) return false;
      // 종류를 본다 — 위젯 입력이 붙으면 그것까지 걸음으로 세게 된다 (S-piece).
      const input = await rc.waitForInput();
      if (input.type === 'advance') return !rc.cancelled;
    }
  }

  /**
   * 한 축 위를 끝까지 훑는다. 갈렸으면 `'pure'`, 다 써 버렸으면 `'exhausted'`,
   * 도중에 취소됐으면 `'cancelled'`. 갈림과 취소를 boolean 하나로 겹쳐 놓으면
   * 부르는 쪽이 둘을 구별하지 못해 취소 뒤에도 축을 갈아 세우게 된다 (C8).
   */
  async function sweep(axis: 'x' | 'y', cuts: number[]): Promise<SweepResult> {
    if (!(await gate())) return 'cancelled';
    await rc.emit({ type: 'axis-picked', payload: { axis } });

    for (const threshold of cuts) {
      if (rc.cancelled) return 'cancelled';
      if (!(await gate())) return 'cancelled';
      const { low, high } = tally(points, classes, axis, threshold);
      const pure = oneLabelOnly(low) && oneLabelOnly(high);
      await rc.emit({
        type: 'cut-tried',
        payload: { axis, threshold, low, high, pure },
      });
      if (pure) return 'pure';
    }
    return 'exhausted';
  }

  async function argue(): Promise<void> {
    // 안 되는 것을 끝까지 해 본다.
    const onX = await sweep('x', xCuts);
    if (onX === 'cancelled') return;
    if (onX === 'exhausted') {
      if (!(await gate())) return;
      await rc.emit({ type: 'axis-exhausted', payload: { axis: 'x', tried: xCuts.length } });
      // 그러고 나서 축을 갈아 세운다.
      if ((await sweep('y', yCuts)) === 'cancelled') return;
    }
    if (!(await gate())) return;
    await rc.emit({ type: 'done' });
  }

  await argue();

  // 자동 재생이 끝났다. 곱씹으며 읽고 싶은 사람을 위해 한 걸음씩 다시 짚는다.
  while (!rc.cancelled) {
    const input = await rc.waitForInput();
    if (input.type !== 'advance') continue;
    manual = true;
    passFirstGate = true;
    await rc.emit({ type: 'rewind' });
    await argue();
  }
}
