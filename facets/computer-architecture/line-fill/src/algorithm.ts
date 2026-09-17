/**
 * line-fill — 한 칸을 짚었을 뿐인데 그 칸이 속한 줄이 통째로 올라온다.
 *
 * 캐시는 원소 단위로 옮기지 않는다. 라인(줄) 단위로 옮긴다. 그래서 부른 것이
 * 하나여도 올라오는 것은 그 줄에 함께 들어 있는 넷이고, 셋은 아무도 찾지 않았다.
 *
 * 1차 데이터는 **라인 크기 · 원소 크기 · 부르는 색인**뿐이다. 줄 번호도, 딸려
 * 오는 색인 범위도, 올라온 원소 수도 여기서 셈한다 — 미리 적어 두면 데이터를
 * 바꿀 때 그 표가 따라오지 않는다.
 *
 * ── 발신은 무엇을 싣지 않는가
 *
 * 줄 번호 · 줄의 첫 색인 · 줄에 드는 원소 수 · 바이트 범위 · 물은 칸 수 ·
 * 올라온 칸 수를 **하나도 싣지 않는다.** 그것들은 전부 바탕(`lineSize` ·
 * `elemSize` · `requests`)과 장면의 구조에서 나오므로, 실어 보내면 화면에
 * 나란히 뜨는 수가 그림과 다른 출처를 갖게 된다. 줄 번호를 내는 셈만
 * 순수 함수로 내주고 장면이 그것을 부른다.
 *
 * 싣는 것은 **걸음이 내리는 판정 하나** — 이번에 부른 칸이 어느 것인가.
 *
 * ── 이벤트 (전부 facet 고유. silent 없음 — 넷 다 화면을 바꾼다)
 *
 *   ask        { index }
 *              부른 것은 이 한 칸. 주소도 줄 번호도 여기서 셈해 나온다.
 *
 *   line-rise  {}
 *              방금 부른 칸이 속한 줄이 통째로 위층으로 올라온다. 어느 줄인지는
 *              직전 `ask` 와 `lineOf` 가 정한다.
 *
 *   tally      {}
 *              부른 칸 수와 올라온 칸 수를 견준다. 둘의 어긋남이 이 조각의
 *              주장이고, 두 수는 장면이 제 목록의 길이에서 센다.
 *
 *   rewind     {}
 *              처음 자리로 되돌린다. 자동 재생을 마친 뒤 `advance` 를 처음 받았을 때.
 *
 * ── 메트릭
 *
 *   없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LineFillData = {
  type: 'line-fill';
  /** 캐시 라인 하나가 덮는 바이트 수. */
  lineSize: number;
  /** 원소 하나가 차지하는 바이트 수. */
  elemSize: number;
  /** 차례로 부르는 배열 색인. */
  requests: number[];
  /** 걸음 사이의 정지 시간 (S-piece). */
  stepMs: number;
};

/**
 * 한 줄에 들어가는 원소 수. 16 바이트 줄에 4 바이트 원소면 넷이다.
 *
 * 장면이 이것을 부른다 — 발신에 실으면 화면의 칸 수와 다른 출처가 된다.
 */
export function perLineOf(lineSize: number, elemSize: number): number {
  return Math.max(1, Math.floor(lineSize / elemSize));
}

/**
 * 그 색인이 속한 줄 번호 — 주소를 라인 크기로 나눈 몫이다.
 *
 * 이 조각의 알고리즘 자체는 "하나를 부르면 줄이 온다" 이고, 줄 번호를 내는
 * 셈은 그 위에 얹힌 **잣대**다. 떼어 내도 조각이 말하려는 바가 남으므로
 * 내준다 (프로토콜 4 절의 B 갈래).
 */
export function lineOf(index: number, lineSize: number, elemSize: number): number {
  return Math.floor((index * elemSize) / lineSize);
}

export async function lineFillAlgorithm(base: FacetContext<LineFillData>): Promise<void> {
  const ctx = base as ReactiveContext<LineFillData>;
  const { requests, stepMs } = ctx.data;

  /**
   * 걸음 사이의 문.
   *
   * 마운트 직후의 첫 걸음은 문을 지나지 않는다 — 문은 걸음 *사이*의 것이라 첫
   * 걸음 앞에는 기다릴 앞걸음이 없고, 문을 먼저 두면 빈 화면이 먼저 보인다.
   * 자동 재생을 마친 뒤에는 `advance` 하나가 걸음 하나가 된다 (S-piece).
   */
  let openFirst = true;
  let auto = true;

  const gate = async (): Promise<boolean> => {
    if (openFirst) {
      openFirst = false;
      return true;
    }
    if (auto) return ctx.sleep(stepMs);
    for (;;) {
      if (ctx.cancelled) return false;
      // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 그것을 걸음으로 세지 않게.
      const input = await ctx.waitForInput();
      // 뒤에서도 본다 — throw 규약에만 기대지 않는다 (C8).
      if (ctx.cancelled) return false;
      if (input.type === 'advance') return true;
    }
  };

  for (;;) {
    for (const index of requests) {
      if (!(await gate())) return;
      await ctx.emit({ type: 'ask', payload: { index } });

      if (!(await gate())) return;
      await ctx.emit({ type: 'line-rise', payload: {} });
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'tally', payload: {} });

    // 자동 재생은 여기까지다. 이제부터는 한 걸음씩 짚어 본다.
    auto = false;
    if (!(await gate())) return;
    await ctx.emit({ type: 'rewind', payload: {} });
    // 되감기 직후의 첫 문만 그냥 통과시킨다 — 첫 누름이 되감기로만 끝나면
    // 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
    openFirst = true;
  }
}
