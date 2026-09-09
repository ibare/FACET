/**
 * 카운팅 정렬 — 값을 견주지 않고 세어서 자리를 얻는다.
 *
 * 세 축을 말한다.
 *   1. **견줌이 한 번도 없다** — 값끼리 크기를 비교하는 자리가 코드에 없다.
 *      `compare-count` 가 0 으로 끝나는 것이 이 알고리즘의 정보다.
 *   2. **개수를 앞에서부터 더하면 시작 자리가 된다** — 값 v 의 첫 자리는 v 보다
 *      작은 값들의 개수 합이다. 개수가 0 인 값은 앞 값과 같은 자리를 갖는다.
 *   3. **앞에서부터 훑어 놓으면 같은 값끼리의 순서가 보존된다** (안정).
 *      놓을 때마다 그 값의 시작 자리를 한 칸 밀기 때문이다.
 *
 * 식별자 (C1): `index:<i>` 만 쓴다. 입력 배열의 칸 번호다. 값 칸(개수/시작
 * 자리)과 출력 자리는 배열이 셋이라 같은 `index:` 를 쓰면 어느 줄인지 갈리므로
 * payload 로만 나른다.
 *
 * 이벤트 (C2):
 *   - phase          payload { phase }                                     silent: true
 *   - init           payload { values, range }
 *   - highlight      target `index:<i>` payload { kind: 'counting'|'placing', index, value }
 *   - unhighlight    target `index:<i>`
 *   - count-bumped   payload { value, count }
 *   - counts-done    payload { counts }
 *   - prefix-step    payload { value, start, count, running }
 *   - starts-done    payload { starts }
 *   - place-into     payload { index, value, slot }
 *   - state-changed  payload { kind: 'advance', value, start }
 *   - mark           target `index:<i>` payload { kind: 'consumed' }
 *   - done           payload { output, placements, comparisons }
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'alloc' | 'count' | 'prefix-sum' | 'place' | 'advance' | 'finish'
 *
 * 메트릭 (C5): 'count-count' · 'place-count' · 'compare-count'
 *
 * `compare-count` 는 선언만 하고 한 번도 갱신하지 않는다. 0 이 화면에 남는 것이
 * 이 facet 이 하려는 말이라, 세지 않는 것 자체가 결과다.
 *
 * 배열을 제자리에서 고치지 않는다 — 결과는 새 배열이다. `ctx.data.values` 를
 * 건드리지 않는 것이 "여벌 자리를 쓴다" 는 성질을 그대로 남긴다.
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type CountingSortData = {
  type: 'array';
  values: number[];
  /** 값의 가짓수 k. 값은 `0 .. range - 1` 범위의 정수다. */
  range: number;
};

/** 정렬 결과를 순수 계산으로 얻는다 (테스트용 — 알고리즘이 아니므로 동기). */
export function computeCountingSortResult(data: CountingSortData): number[] {
  const k = resolveRange(data.values, data.range);
  const count = new Array<number>(k).fill(0);
  for (const value of data.values) count[value] += 1;
  const start = new Array<number>(k).fill(0);
  let total = 0;
  for (let val = 0; val < k; val++) {
    start[val] = total;
    total += count[val];
  }
  const output = new Array<number>(data.values.length).fill(0);
  for (const value of data.values) {
    output[start[value]] = value;
    start[value] += 1;
  }
  return output;
}

/** 선언된 k 가 없거나 값 범위를 못 담으면 최댓값+1 로 넓힌다. */
function resolveRange(values: number[], declared: number | undefined): number {
  let needed = 0;
  for (const value of values) needed = Math.max(needed, value + 1);
  return Math.max(typeof declared === 'number' ? declared : 0, needed);
}

export async function countingSort(ctx: FacetContext<CountingSortData>): Promise<void> {
  const values = ctx.data.values;
  const n = values.length;
  const k = resolveRange(values, ctx.data.range);

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  // ── 마련하기. 개수 줄 · 시작 자리 줄 · 출력 줄을 한꺼번에 낸다.
  await phase('alloc');
  const count = new Array<number>(k).fill(0);
  const start = new Array<number>(k).fill(0);
  const output = new Array<number>(n).fill(0);
  let total = 0;
  // 0. 초기 상태 통보. 리포 공통 어휘 `init` 을 쓴다 (C2).
  await ctx.emit({ type: 'init', payload: { values: [...values], range: k } });

  // ── 세기. 값을 견주지 않고 자기 칸의 눈금만 하나 올린다.
  for (let i = 0; i < n; i++) {
    if (ctx.cancelled) return;

    await phase('count');
    const value = values[i];
    await ctx.emit({
      type: 'highlight',
      target: `index:${i}`,
      payload: { kind: 'counting', index: i, value },
    });
    count[value] += 1;
    ctx.metric('count-count', 'inc');
    await ctx.emit({ type: 'count-bumped', payload: { value, count: count[value] } });
    await ctx.emit({ type: 'unhighlight', target: `index:${i}` });
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'counts-done', payload: { counts: [...count] } });

  // ── 누적합. 앞에서부터 개수를 더해 값마다 첫 자리를 얻는다.
  for (let val = 0; val < k; val++) {
    if (ctx.cancelled) return;

    await phase('prefix-sum');
    start[val] = total;
    const running = total + count[val];
    await ctx.emit({
      type: 'prefix-step',
      payload: { value: val, start: total, count: count[val], running },
    });
    total = running;
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'starts-done', payload: { starts: [...start] } });

  // ── 놓기. 앞에서부터 훑어 자기 자리에 곧장 놓고, 그 자리를 한 칸 민다.
  for (let i = 0; i < n; i++) {
    if (ctx.cancelled) return;

    await phase('place');
    const value = values[i];
    await ctx.emit({
      type: 'highlight',
      target: `index:${i}`,
      payload: { kind: 'placing', index: i, value },
    });

    const slot = start[value];
    output[slot] = value;
    ctx.metric('place-count', 'inc');
    await ctx.emit({ type: 'place-into', payload: { index: i, value, slot } });

    await phase('advance');
    start[value] = slot + 1;
    await ctx.emit({
      type: 'state-changed',
      payload: { kind: 'advance', value, start: start[value] },
    });

    await ctx.emit({ type: 'mark', target: `index:${i}`, payload: { kind: 'consumed' } });
    await ctx.emit({ type: 'unhighlight', target: `index:${i}` });
  }

  if (ctx.cancelled) return;

  await phase('finish');
  await ctx.emit({
    type: 'done',
    payload: { output: [...output], placements: n, comparisons: 0 },
  });
}
