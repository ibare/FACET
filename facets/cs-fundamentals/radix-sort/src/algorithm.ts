/**
 * 기수 정렬 (LSD) — 한 자리씩만 보고 줄 세우기를 되풀이한다.
 *
 * 두 축을 말한다.
 *   1. **낮은 자리부터 한다** — 1의 자리, 10의 자리, 100의 자리 순으로.
 *   2. **매 라운드가 앞 라운드의 순서를 뒤엎지 않는다 (안정)** — 그래서 마지막
 *      자리를 마쳤을 때 전체가 줄 서 있다. 뒤에서부터 놓는 것이 그 안정성의
 *      근거다.
 *
 * 값끼리 견주는 일이 한 번도 없다. `compare-count` 는 0 에서 움직이지 않으며
 * 그것이 이 알고리즘의 요점이라, 화면에 0 으로 뜨도록 선언만 해 둔다 (C5).
 *
 * 식별자 (C1): `index:<i>` 만 쓴다. 배열의 칸 번호가 전부다. 통(0~9)과 놓을
 * 자리는 payload 의 `digit` / `slot` 으로 보낸다 — 새 prefix 를 만들지 않는다.
 *
 * 이벤트 (C2):
 *   - phase          payload { phase }                                    silent: true
 *   - scan-max       payload { maxValue, size }
 *   - round-begin    payload { round, exp }
 *   - highlight      target `index:<i>` payload { kind: 'reading', index, value, digit, exp }
 *   - unhighlight    target `index:<i>`
 *   - bucket-count   payload { digit, count }
 *   - bucket-prefix  payload { digit, value, added }
 *   - place          target `index:<i>` payload { index, value, digit, slot }
 *   - round-end      payload { round, exp, values }
 *   - done           payload { rounds, places }
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'scan-max' | 'pick-place' | 'read-digit' | 'count-digit' |
 *   'prefix-sum' | 'place-back' | 'round-end'
 *
 * 메트릭 (C5): 'round-count' · 'place-count' · 'compare-count' (언제나 0)
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type RadixSortData = { type: 'array'; values: number[] };

/** 통은 열 개 — 십진수의 자리마다 나올 수 있는 숫자의 가짓수. */
const BASE = 10;

export async function radixSort(ctx: FacetContext<RadixSortData>): Promise<void> {
  const arr = ctx.data.values;
  const n = arr.length;
  let rounds = 0;
  let places = 0;

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  if (n === 0) {
    await ctx.emit({ type: 'done', payload: { rounds, places } });
    return;
  }

  await phase('scan-max');
  let maxValue = arr[0];
  for (let i = 1; i < n; i++) {
    if (arr[i] > maxValue) maxValue = arr[i];
  }
  await ctx.emit({ type: 'scan-max', payload: { maxValue, size: n } });

  let exp = 1;
  while (exp <= maxValue) {
    if (ctx.cancelled) return;

    await phase('pick-place');
    rounds++;
    ctx.metric('round-count', 'inc');
    await ctx.emit({ type: 'round-begin', payload: { round: rounds, exp } });

    // ── 한 자리로 한 번 줄 세우기 (counting_by_digit) ──────────────────
    const output: number[] = new Array<number>(n).fill(0);
    const count: number[] = new Array<number>(BASE).fill(0);

    // 1) 세기 — 앞에서부터 훑으며 자리 숫자별로 몇 개인지 센다.
    for (let i = 0; i < n; i++) {
      if (ctx.cancelled) return;

      await phase('read-digit');
      const d = Math.floor(arr[i] / exp) % BASE;
      await ctx.emit({
        type: 'highlight',
        target: `index:${i}`,
        payload: { kind: 'reading', index: i, value: arr[i], digit: d, exp },
      });

      await phase('count-digit');
      count[d]++;
      await ctx.emit({ type: 'bucket-count', payload: { digit: d, count: count[d] } });
      await ctx.emit({ type: 'unhighlight', target: `index:${i}` });
    }

    // 2) 누적합 — 통의 개수를 "이 숫자까지의 자리 수" 로 바꾼다.
    for (let d = 1; d < BASE; d++) {
      if (ctx.cancelled) return;

      await phase('prefix-sum');
      const added = count[d - 1];
      count[d] += added;
      await ctx.emit({ type: 'bucket-prefix', payload: { digit: d, value: count[d], added } });
    }

    // 3) 뒤에서부터 놓기 — 이 방향이 안정성의 근거다. 같은 숫자를 가진 값들은
    //    뒤엣것이 먼저 내려가 뒤 칸을 차지하므로 앞뒤 순서가 그대로 보존된다.
    for (let i = n - 1; i >= 0; i--) {
      if (ctx.cancelled) return;

      await phase('read-digit');
      const d = Math.floor(arr[i] / exp) % BASE;
      await ctx.emit({
        type: 'highlight',
        target: `index:${i}`,
        payload: { kind: 'reading', index: i, value: arr[i], digit: d, exp },
      });

      await phase('place-back');
      count[d]--;
      const slot = count[d];
      output[slot] = arr[i];
      places++;
      ctx.metric('place-count', 'inc');
      await ctx.emit({
        type: 'place',
        target: `index:${i}`,
        payload: { index: i, value: arr[i], digit: d, slot },
      });
      await ctx.emit({ type: 'unhighlight', target: `index:${i}` });
    }

    if (ctx.cancelled) return;

    // 4) 라운드 끝 — 줄 세운 결과를 되돌려 담고 다음 자리로 옮긴다.
    await phase('round-end');
    for (let k = 0; k < n; k++) arr[k] = output[k];
    await ctx.emit({
      type: 'round-end',
      payload: { round: rounds, exp, values: [...arr] },
    });

    exp *= BASE;
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done', payload: { rounds, places } });
}
