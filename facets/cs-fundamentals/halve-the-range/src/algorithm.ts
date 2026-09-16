/**
 * halveTheRange — 구간 반분 조각(piece).
 *
 * 줄이 선 값에서 가운데 하나를 견주면 남은 후보의 폭이 한 번에 반씩 사라진다.
 * 이 조각이 말하려는 것은 "절반을 버린다" 가 어림이 아니라 셈이라는 것이다 —
 * 한 번의 견줌으로 정확히 몇이 후보에서 빠지는지 세어서 보인다.
 *
 * 그러므로 발신은 **판정만** 싣는다. 몇이 빠졌고 몇이 남았고 몇 번 견주었는지는
 * 전부 구간에서 셈해지므로 장면이 세고, 가운데 자리는 `midOf` 를 장면이 함께
 * 불러 얻는다. 걸음표를 손으로 적어 두지 않았고, 걸음의 순서는 이진 탐색 자체가
 * 정한다.
 *
 * ── 식별자
 *   index:<i>   values 배열의 자리
 *
 * ── 이벤트 (전부 이 facet 고유. silent 없음 — 모두 시각 변화를 동반한다)
 *
 *   range-set  {}
 *              살아 있는 구간을 세운다. 재생의 첫 걸음. 구간은 줄 전체이므로
 *              실을 것이 없다.
 *
 *   probe      {}
 *              가운데 자리를 짚는다. 곧 견줌이 일어난다. 어느 자리인지는 지금
 *              구간과 `midOf` 가 정한다.
 *              target: `index:<mid>`
 *
 *   narrow     { cmp: 'lt' | 'gt' }
 *              견줌 결과로 구간이 좁아진다. 싣는 것은 **어느 쪽이 걷히는가** 라는
 *              판정 하나뿐이다 — 걷힌 자리도 남은 폭도 거기서 나온다.
 *
 *   found      {}
 *              가운데가 찾던 값이었다. 구간이 그 한 자리로 접히고 양옆의
 *              나머지 후보도 함께 빠진다.
 *              target: `index:<mid>`
 *
 *   done       {}
 *              끝. 견줌 횟수는 `probe` 발신 수이고 후보의 처음/끝 개수는 줄과
 *              구간의 폭이라, 장면이 전부 센다.
 *
 *   rewind     {}
 *              advance 로 처음부터 다시 짚기 시작할 때 화면을 초기 상태로 되돌린다.
 *
 * ── 메트릭
 *   없다. 조각은 세지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HalveTheRangeData = {
  type: 'halve-the-range';
  /**
   * 오름차순으로 줄이 선 값. 반분은 이 전제 위에서만 성립한다 —
   * 전제를 밝히는 것은 글의 몫이다 (description.ts).
   */
  values: number[];
  /** 찾는 값. */
  target: number;
  /** 걸음 사이 간격. 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

const DEFAULT_STEP_MS = 800;

/**
 * 구간 lo..hi 의 가운데 자리.
 *
 * **잣대를 여기 한 곳에만 둔다.** 이것을 algorithm 과 장면이 각자 `Math.floor`
 * 로 셈하면 폭이 짝수일 때 어느 쪽을 가운데로 볼지가 갈린다 — 화면이 짚는 칸과
 * 알고리즘이 견준 칸이 다른 자리가 된다. 그래서 값을 발신에 싣는 대신 함수를
 * 내주고 `scene.ts` 가 같은 함수를 부른다 (프로토콜 4절 B 갈래).
 */
export function midOf(lo: number, hi: number): number {
  return Math.floor((lo + hi) / 2);
}

/**
 * 걸음 사이의 문.
 *
 * 자동 재생이면 시간이 열고, 한 걸음 모드면 사용자가 연다. 걸음 함수 하나를
 * 두 방식으로 돌리려고 문만 갈아 끼운다 — 그래야 emit 이 리터럴로 남는다 (C2).
 */
type Gate = () => Promise<void>;

/** 이진 탐색 한 판. 문이 열릴 때마다 한 걸음씩 나아간다. */
async function play(ctx: ReactiveContext<HalveTheRangeData>, gate: Gate): Promise<void> {
  const values = ctx.data.values;
  const target = ctx.data.target;
  let lo = 0;
  let hi = values.length - 1;

  await gate();
  await ctx.emit({ type: 'range-set', payload: {} });

  while (lo <= hi) {
    const mid = midOf(lo, hi);
    const value = values[mid];

    await gate();
    await ctx.emit({ type: 'probe', target: `index:${mid}`, payload: {} });

    await gate();
    if (value === target) {
      // 찾은 자리만 남고 좌우의 남은 후보가 함께 빠진다. 어느 자리들이 빠지는지는
      // 지금 구간과 가운데가 이미 말하므로 싣지 않는다.
      await ctx.emit({ type: 'found', target: `index:${mid}`, payload: {} });
      return finish(ctx, gate);
    }

    if (value < target) {
      // 왼쪽 절반과 가운데가 함께 걷힌다.
      lo = mid + 1;
      await ctx.emit({ type: 'narrow', payload: { cmp: 'lt' } });
    } else {
      hi = mid - 1;
      await ctx.emit({ type: 'narrow', payload: { cmp: 'gt' } });
    }
  }

  return finish(ctx, gate);
}

/** 마무리 한 걸음. 찾은 자리를 한 박자 보인 뒤에 셈을 말한다. */
async function finish(ctx: ReactiveContext<HalveTheRangeData>, gate: Gate): Promise<void> {
  await gate();
  await ctx.emit({ type: 'done', payload: {} });
}

/** advance 가 올 때까지 기다린다. 그 밖의 입력은 흘린다. */
async function waitForAdvance(ctx: ReactiveContext<HalveTheRangeData>): Promise<void> {
  for (;;) {
    const input = await ctx.waitForInput();
    if (ctx.cancelled) throw new Error('cancelled');
    if (input.type === 'advance') return;
  }
}

export const halveTheRange = async (c: FacetContext<HalveTheRangeData>): Promise<void> => {
  const ctx = c as ReactiveContext<HalveTheRangeData>;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  // 자동 재생. 첫 문만 그냥 통과시켜 마운트 직후 화면이 비어 있지 않게 한다.
  let firstAuto = true;
  await play(ctx, async () => {
    if (firstAuto) {
      firstAuto = false;
      return;
    }
    const ok = await ctx.sleep(stepMs);
    if (!ok || ctx.cancelled) throw new Error('cancelled');
  });

  // 재생이 끝난 뒤 — advance 를 누르면 되감고 처음부터 한 걸음씩 짚는다.
  // 되감기 직후의 첫 문도 통과시킨다. 그러지 않으면 첫 누름이 되감기만 하고
  // 멈춰, 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
  for (;;) {
    await waitForAdvance(ctx);
    await ctx.emit({ type: 'rewind', payload: {} });
    let firstManual = true;
    await play(ctx, async () => {
      if (firstManual) {
        firstManual = false;
        return;
      }
      await waitForAdvance(ctx);
    });
  }
};
