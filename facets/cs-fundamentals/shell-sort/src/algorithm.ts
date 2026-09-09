/**
 * 셸 정렬 — 삽입 정렬을 **간격을 두고** 한다.
 *
 * 두 축을 말한다.
 *   1. **골격은 삽입 정렬 그대로이고 `1` 이 `gap` 으로 바뀐 것뿐이다.** 값을
 *      집어 들고, 왼쪽 것이 더 크면 비켜서게 하고, 자리가 나면 놓는다. 다만
 *      "왼쪽" 이 옆칸이 아니라 `gap` 칸 건너다.
 *   2. **간격 라운드 하나는 서로 떨어진 사슬 여럿을 각각 정렬한 것과 같다.**
 *      값 일곱에 간격 3 이면 자리 0·3·6 / 1·4 / 2·5 세 사슬이고, 사슬끼리는
 *      서로를 건드리지 않는다. 그렇게 큰 어긋남을 미리 걷어 두면 마지막 간격 1
 *      라운드가 할 일이 적다.
 *
 * 간격은 `len(arr) // 2` 에서 시작해 반씩 접는다. 값 일곱이면 3 → 1 이다.
 * 사양이 정한 간격 수열을 따로 박아 둔 것이 아니라 코드가 셈해 낸 것이다.
 *
 * 식별자 (C1): `index:<i>` 만 쓴다. 배열의 칸 번호가 전부다.
 *
 * 이벤트 (C2):
 *   - phase        payload { phase }                                     silent: true
 *   - baseline     payload { compares, shifts }
 *                  같은 입력을 간격 1 만으로 (= 보통의 삽입 정렬) 했을 때의 셈.
 *                  화면이 들고 있어야 하는 대조군이라 알고리즘이 직접 세어 준다.
 *   - round-begin  payload { round, gap, chains: number[][] }
 *   - pick         target `index:<i>`      payload { index, value, gap, chain }
 *   - highlight    target `index:<k>`      payload { kind: 'comparing', index, value, held, greater }
 *   - shift        target [`index:<from>`, `index:<to>`] payload { from, to, value }
 *   - place        target `index:<j>`      payload { index, value, moved, shifted }
 *   - round-end    payload { round, gap, compares, shifts }
 *   - mark         target `index:<i>`[]    payload { kind: 'sorted' }
 *   - done         payload { compares, shifts, rounds, baselineShifts }
 *
 * `unhighlight` 를 쓰지 않는다. 견줌 표시는 다음 걸음 (비켜섬 · 놓음 · 다음 집음)
 * 이 스스로 거둔다 — 거두는 걸음을 따로 두면 견줌마다 빈 걸음이 하나씩 낀다.
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'set-gap' | 'pick-value' | 'compare' | 'shift' | 'place' | 'gap-end'
 *
 * 메트릭 (C5): 'compare-count' · 'shift-count' · 'gap-count'
 *
 * 견줌은 `arr[j - gap] > temp` 를 실제로 따져 본 횟수다. `j >= gap` 이 깨져
 * 멈추는 것은 값을 보지 않았으므로 세지 않는다 — 코드의 `&&` 가 오른쪽을
 * 건너뛰는 것과 같다.
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type ShellSortData = { type: 'array'; values: number[] };

/** 간격 `gap` 이 가르는 사슬들. 값 일곱 · 간격 3 이면 [[0,3,6],[1,4],[2,5]]. */
function chainsOf(length: number, gap: number): number[][] {
  const out: number[][] = [];
  for (let start = 0; start < gap && start < length; start++) {
    const chain: number[] = [];
    for (let k = start; k < length; k += gap) chain.push(k);
    out.push(chain);
  }
  return out;
}

/**
 * 같은 입력을 간격 1 만으로 정렬했을 때의 견줌 · 이동 수.
 *
 * 화면의 대조군이다. 이벤트를 내지 않고 사본 위에서 세기만 한다 — 화면에 뜨는
 * 수는 전부 알고리즘이 셈한 것이어야 하기 때문이다.
 */
export function countNeighbourOnly(values: number[]): {
  compares: number;
  shifts: number;
} {
  const arr = [...values];
  let compares = 0;
  let shifts = 0;
  for (let i = 1; i < arr.length; i++) {
    const temp = arr[i];
    let j = i;
    while (j >= 1) {
      compares++;
      if (arr[j - 1] <= temp) break;
      arr[j] = arr[j - 1];
      shifts++;
      j -= 1;
    }
    arr[j] = temp;
  }
  return { compares, shifts };
}

export async function shellSort(ctx: FacetContext<ShellSortData>): Promise<void> {
  const arr = ctx.data.values;
  const n = arr.length;

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  const neighbourOnly = countNeighbourOnly(arr);
  await ctx.emit({
    type: 'baseline',
    payload: { compares: neighbourOnly.compares, shifts: neighbourOnly.shifts },
  });
  if (ctx.cancelled) return;

  let compares = 0;
  let shifts = 0;
  let round = 0;

  await phase('set-gap');
  let gap = Math.floor(n / 2);

  while (gap > 0) {
    if (ctx.cancelled) return;

    round++;
    ctx.metric('gap-count', 'inc');
    let roundCompares = 0;
    let roundShifts = 0;
    await ctx.emit({
      type: 'round-begin',
      payload: { round, gap, chains: chainsOf(n, gap) },
    });

    for (let i = gap; i < n; i++) {
      if (ctx.cancelled) return;

      await phase('pick-value');
      const temp = arr[i];
      let j = i;
      await ctx.emit({
        type: 'pick',
        target: `index:${i}`,
        payload: { index: i, value: temp, gap, chain: i % gap },
      });

      while (j >= gap) {
        if (ctx.cancelled) return;

        await phase('compare');
        const left = arr[j - gap];
        const greater = left > temp;
        compares++;
        roundCompares++;
        ctx.metric('compare-count', 'inc');
        await ctx.emit({
          type: 'highlight',
          target: `index:${j - gap}`,
          payload: { kind: 'comparing', index: j - gap, value: left, held: temp, greater },
        });

        if (!greater) break;

        await phase('shift');
        arr[j] = left;
        shifts++;
        roundShifts++;
        ctx.metric('shift-count', 'inc');
        await ctx.emit({
          type: 'shift',
          target: [`index:${j - gap}`, `index:${j}`],
          payload: { from: j - gap, to: j, value: left },
        });
        j -= gap;
      }

      if (ctx.cancelled) return;

      await phase('place');
      arr[j] = temp;
      await ctx.emit({
        type: 'place',
        target: `index:${j}`,
        payload: { index: j, value: temp, moved: j !== i, shifted: (i - j) / gap },
      });
    }

    if (ctx.cancelled) return;

    await phase('gap-end');
    await ctx.emit({
      type: 'round-end',
      payload: { round, gap, compares: roundCompares, shifts: roundShifts },
    });
    gap = Math.floor(gap / 2);
    if (gap > 0) await phase('set-gap');
  }

  if (ctx.cancelled) return;

  const everyIndex: string[] = [];
  for (let i = 0; i < n; i++) everyIndex.push(`index:${i}`);
  if (everyIndex.length > 0) {
    await ctx.emit({ type: 'mark', target: everyIndex, payload: { kind: 'sorted' } });
  }
  if (ctx.cancelled) return;

  await ctx.emit({
    type: 'done',
    payload: { compares, shifts, rounds: round, baselineShifts: neighbourOnly.shifts },
  });
}
