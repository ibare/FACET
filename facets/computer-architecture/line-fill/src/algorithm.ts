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
 * ── 이벤트 (전부 facet 고유. silent 없음 — 넷 다 화면을 바꾼다)
 *
 *   ask        { index, addr, line }
 *              부른 것은 이 한 칸. `addr` 은 바이트 주소, `line` 은 `addr / lineSize` 의 몫.
 *
 *   line-rise  { line, first, count, asked, lo, hi }
 *              그 칸이 속한 줄이 통째로 위층으로 올라온다. `first` 는 줄의 첫 색인,
 *              `count` 는 줄에 담기는 원소 수, `asked` 는 그중 실제로 부른 색인,
 *              `lo`·`hi` 는 줄이 덮는 바이트 범위(양끝 포함).
 *
 *   tally      { asked, arrived }
 *              부른 칸 수와 올라온 칸 수. 둘의 어긋남이 이 조각의 주장이다.
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

export async function lineFillAlgorithm(base: FacetContext<LineFillData>): Promise<void> {
  const ctx = base as ReactiveContext<LineFillData>;
  const { lineSize, elemSize, requests, stepMs } = ctx.data;

  /** 한 줄에 들어가는 원소 수. 16 바이트 줄에 4 바이트 원소면 넷이다. */
  const perLine = Math.max(1, Math.floor(lineSize / elemSize));

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
    /** 이 바퀴에서 실제로 올라온 줄. 같은 줄을 두 번 불러도 한 번만 올라온다. */
    const risen = new Set<number>();

    for (const index of requests) {
      const addr = index * elemSize;
      const line = Math.floor(addr / lineSize);
      risen.add(line);

      if (!(await gate())) return;
      await ctx.emit({ type: 'ask', payload: { index, addr, line } });

      if (!(await gate())) return;
      const lo = line * lineSize;
      await ctx.emit({
        type: 'line-rise',
        payload: { line, first: line * perLine, count: perLine, asked: index, lo, hi: lo + lineSize - 1 },
      });
    }

    if (!(await gate())) return;
    await ctx.emit({
      type: 'tally',
      payload: { asked: requests.length, arrived: risen.size * perLine },
    });

    // 자동 재생은 여기까지다. 이제부터는 한 걸음씩 짚어 본다.
    auto = false;
    if (!(await gate())) return;
    await ctx.emit({ type: 'rewind', payload: {} });
    // 되감기 직후의 첫 문만 그냥 통과시킨다 — 첫 누름이 되감기로만 끝나면
    // 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
    openFirst = true;
  }
}
