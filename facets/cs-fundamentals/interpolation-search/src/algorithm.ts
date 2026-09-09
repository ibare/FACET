/**
 * 보간 탐색 — 가운데를 무턱대고 짚는 대신 **값의 크기로 자리를 겨눈다**.
 *
 * 이진 탐색과 골격이 같다. `while lo <= hi` · 세 갈래 판정 · 구간 좁히기.
 * 다른 것은 자리를 정하는 한 줄이다.
 *
 *   mid = lo + ((target - arr[lo]) * (hi - lo)) // (arr[hi] - arr[lo])
 *
 * 값이 고르게 퍼져 있으면 이 겨눔이 한 번에 닿는다. 그것을 눈으로 재기 위해
 * **같은 자료를 반씩 접는 방식으로도** 훑어 걸음 수를 나란히 센다. 화면에 뜨는
 * 수는 전부 여기서 셈한 것이다.
 *
 * 식별자 (C1): `index:<i>` 만 쓴다. 배열의 칸 번호가 전부다.
 *
 * 이벤트 (C2):
 *   - phase          payload { phase }                                        silent: true
 *   - search-begin   payload { target, lo, hi, loValue, hiValue }
 *   - range-check    payload { lo, hi, loValue, hiValue, ok }
 *   - probe          target `index:<mid>`
 *                    payload { lo, hi, mid, value, target, loValue, hiValue,
 *                              numer, denom, offset, probes }
 *   - highlight      target `index:<mid>`
 *                    payload { kind: 'comparing', index, value, target,
 *                              verdict: 'hit' | 'too-small' | 'too-big' }
 *   - unhighlight    target `index:<mid>`
 *   - mark           target `index:<mid>` payload { kind: 'found' }
 *   - narrow         payload { side: 'left' | 'right', lo, hi, mid }
 *   - search-found   payload { index, value, probes }
 *   - search-missed  payload { target, probes }
 *   - halving-begin  payload { target }
 *   - halving-probe  target `index:<mid>`
 *                    payload { step, lo, hi, mid, value, hit }
 *   - done           payload { probes, halvings, index }
 *
 * `narrow` 의 `side` 는 **버리는 쪽** 이다. `left` 면 `mid` 왼쪽을 통째로 버리고
 * `lo = mid + 1` 이 된다.
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'setup' | 'range-check' | 'probe' | 'compare' | 'found' |
 *   'drop-left' | 'drop-right'
 *
 * 반씩 접는 쪽 (`halving-*`) 은 phase 를 발신하지 않는다 — 코드 패널이 들고
 * 있는 것은 보간 탐색이고, 견주는 쪽은 그 코드에 대응하는 줄이 없다.
 *
 * 메트릭 (C5): 'probe-count' · 'halving-count'
 *
 * 견줌은 세지 않는다. 겨눔 한 번마다 견줌이 한 번이라 어떤 입력에서도
 * probe-count 와 갈리지 않는데, 컨트롤바에 같은 수가 둘 뜨면 이 화면의
 * 주장인 '겨눔 1 대 반 접기 3' 이 세 숫자 사이에서 흐려진다.
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type InterpolationSearchData = {
  type: 'array';
  /** 오름차순으로 서로 다른 값. 겨눔이 성립하려면 정렬돼 있어야 한다. */
  values: number[];
  /** 찾는 값. */
  target: number;
};

/** 견줌 한 번의 판정. */
type Verdict = 'hit' | 'too-small' | 'too-big';

export async function interpolationSearch(
  ctx: FacetContext<InterpolationSearchData>,
): Promise<void> {
  const arr = ctx.data.values;
  const target = ctx.data.target;

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  if (arr.length === 0) {
    await ctx.emit({ type: 'done', payload: { probes: 0, halvings: 0, index: -1 } });
    return;
  }

  // ── 겨누는 쪽 ──────────────────────────────────────────────────────────
  let lo = 0;
  let hi = arr.length - 1;
  let probes = 0;
  let found = -1;

  await phase('setup');
  await ctx.emit({
    type: 'search-begin',
    payload: { target, lo, hi, loValue: arr[lo], hiValue: arr[hi] },
  });

  while (!ctx.cancelled) {
    await phase('range-check');
    const inRange = lo <= hi && target >= arr[lo] && target <= arr[hi];
    await ctx.emit({
      type: 'range-check',
      payload: { lo, hi, loValue: arr[lo], hiValue: arr[hi], ok: inRange },
    });
    if (!inRange) break;

    await phase('probe');
    // 겨누는 식. 곱셈이 나눗셈보다 먼저다 — 정수 나눗셈에서 순서가 결과를 바꾼다.
    const numer = (target - arr[lo]) * (hi - lo);
    const denom = arr[hi] - arr[lo];
    const offset = Math.floor(numer / denom);
    const mid = lo + offset;
    probes += 1;
    ctx.metric('probe-count', 'inc');
    await ctx.emit({
      type: 'probe',
      target: `index:${mid}`,
      payload: {
        lo,
        hi,
        mid,
        value: arr[mid],
        target,
        loValue: arr[lo],
        hiValue: arr[hi],
        numer,
        denom,
        offset,
        probes,
      },
    });

    await phase('compare');
    const verdict: Verdict =
      arr[mid] === target ? 'hit' : arr[mid] < target ? 'too-small' : 'too-big';
    await ctx.emit({
      type: 'highlight',
      target: `index:${mid}`,
      payload: { kind: 'comparing', index: mid, value: arr[mid], target, verdict },
    });

    if (verdict === 'hit') {
      await phase('found');
      found = mid;
      await ctx.emit({ type: 'mark', target: `index:${mid}`, payload: { kind: 'found' } });
      await ctx.emit({
        type: 'search-found',
        payload: { index: mid, value: arr[mid], probes },
      });
      break;
    }

    if (verdict === 'too-small') {
      await phase('drop-left');
      lo = mid + 1;
      await ctx.emit({ type: 'unhighlight', target: `index:${mid}` });
      await ctx.emit({ type: 'narrow', payload: { side: 'left', lo, hi, mid } });
    } else {
      await phase('drop-right');
      hi = mid - 1;
      await ctx.emit({ type: 'unhighlight', target: `index:${mid}` });
      await ctx.emit({ type: 'narrow', payload: { side: 'right', lo, hi, mid } });
    }
  }

  if (ctx.cancelled) return;

  if (found < 0) {
    await ctx.emit({ type: 'search-missed', payload: { target, probes } });
  }

  // ── 견주는 쪽: 같은 자료를 반씩 접어 훑는다 ────────────────────────────
  //
  // 코드 패널이 들고 있는 것은 위쪽 알고리즘이므로 여기서는 phase 를 발신하지
  // 않는다. 화면의 "1 대 3" 은 이 걸음 수를 실제로 세어서 나온다.
  await ctx.emit({ type: 'halving-begin', payload: { target } });

  let hLo = 0;
  let hHi = arr.length - 1;
  let halvings = 0;

  while (hLo <= hHi) {
    if (ctx.cancelled) return;
    const hMid = hLo + Math.floor((hHi - hLo) / 2);
    halvings += 1;
    ctx.metric('halving-count', 'inc');
    const hit = arr[hMid] === target;
    await ctx.emit({
      type: 'halving-probe',
      target: `index:${hMid}`,
      payload: { step: halvings, lo: hLo, hi: hHi, mid: hMid, value: arr[hMid], hit },
    });
    if (hit) break;
    if (arr[hMid] < target) hLo = hMid + 1;
    else hHi = hMid - 1;
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done', payload: { probes, halvings, index: found } });
}
