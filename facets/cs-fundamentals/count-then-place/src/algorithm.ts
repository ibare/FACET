/**
 * 계수 배치 (count-then-place) — 값마다 몇 개인지 세어 두면 견주지 않고도 자리가 정해진다.
 *
 * 세 국면이 한 논증을 이룬다.
 *   1. 센다      값 하나를 읽을 때마다 그 값의 눈금이 하나 쌓인다.
 *   2. 굳는다    쌓인 눈금 더미를 앞에서부터 더해 시작 자리 번호를 얻는다.
 *   3. 놓는다    왼쪽부터 값을 집어 제 번호로 곧장 보낸다. 놓을 때마다 번호가 하나 오른다.
 *
 * 이 알고리즘은 **값끼리 견주는 연산을 한 번도 하지 않는다.** 그것이 이 조각의 주장이므로
 * 걸음 어디에도 비교 이벤트가 없다.
 *
 * ── 이벤트 (전부 facet 고유 확장. `done` 만 표준)
 *
 * | type             | target      | payload                                              | silent |
 * | ---------------- | ----------- | ---------------------------------------------------- | ------ |
 * | `caption-changed`| —           | `{ textKey: string }`                                | 아니오 |
 * | `count-tick`     | `index:<i>` | `{ index: number; value: number; height: number }`   | 아니오 |
 * | `bucket-settle`  | —           | `{ value: number; start: number; count: number }`    | 아니오 |
 * | `place`          | `index:<i>` | `{ index; value; slot; bucketFull: boolean }`        | 아니오 |
 * | `rewind`         | —           | 없음                                                 | 아니오 |
 * | `done`           | —           | 없음                                                 | 아니오 |
 *
 * `height` 는 그 값의 눈금이 몇 번째로 쌓이는지 (1-based), `start` 는 그 값의 첫 자리 번호,
 * `bucketFull` 은 이번 배치로 그 값의 구역이 다 찼는지다. 화면 문안은 실려 있지 않다 —
 * 캡션은 키만 보내고 projector 가 해석한다 (C10).
 *
 * ── 진행
 *
 * reactive 메커니즘. mount 직후 `stepMs` 간격으로 스스로 한 번 재생하고, 그 뒤로는
 * `advance` 입력을 받아 같은 걸음을 하나씩 되짚는다. 자동 재생이 끝난 뒤 처음 누르는
 * `advance` 는 `rewind` 를 보내고 **첫 걸음까지** 보인다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type CountThenPlaceData = {
  type: 'count-then-place';
  /** 늘어놓을 값들. 각 값은 0 이상 range 미만. */
  values: number[];
  /** 값의 종류 수 (0 .. range-1). 계수 배치가 성립하는 전제. */
  range: number;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/**
 * 걸음 사이의 문. 자동 재생이면 `stepMs` 를 자고, 수동이면 `advance` 를 기다린다.
 * false 를 돌려주면 취소된 것이므로 그 자리에서 멈춘다.
 */
type Gate = () => Promise<boolean>;

/** `advance` 하나를 기다린다. 취소되었거나 입력 채널이 닫히면 false. */
async function waitAdvance(ctx: ReactiveContext<CountThenPlaceData>): Promise<boolean> {
  for (;;) {
    let input: ReactiveInputEvent;
    try {
      input = await ctx.waitForInput();
    } catch {
      return false;
    }
    if (ctx.cancelled) return false;
    if (input.type === 'advance') return true;
  }
}

/**
 * 세기 → 굳기 → 놓기를 한 번 통과한다. 걸음의 개수와 순서는 데이터가 정한다 —
 * 값의 개수만큼 세고, 값의 종류만큼 굳히고, 값의 개수만큼 놓는다.
 */
async function playThrough(
  ctx: ReactiveContext<CountThenPlaceData>,
  gate: Gate,
): Promise<boolean> {
  const { values, range } = ctx.data;

  // ── 1. 센다. 견주지 않는다. 값을 읽어 그 값의 눈금을 하나 올릴 뿐이다.
  await ctx.emit({ type: 'caption-changed', payload: { textKey: 'caption.count' } });
  const counts = new Array<number>(range).fill(0);
  for (let i = 0; i < values.length; i += 1) {
    if (!(await gate())) return false;
    const value = values[i];
    counts[value] += 1;
    await ctx.emit({
      type: 'count-tick',
      target: `index:${i}`,
      payload: { index: i, value, height: counts[value] },
    });
  }

  // ── 2. 굳는다. 앞에서부터 더한 것이 그 값의 시작 자리다.
  await ctx.emit({ type: 'caption-changed', payload: { textKey: 'caption.settle' } });
  const starts = new Array<number>(range).fill(0);
  let acc = 0;
  for (let value = 0; value < range; value += 1) {
    if (!(await gate())) return false;
    starts[value] = acc;
    acc += counts[value];
    await ctx.emit({
      type: 'bucket-settle',
      payload: { value, start: starts[value], count: counts[value] },
    });
  }

  // ── 3. 놓는다. 자리는 이미 정해져 있으므로 곧장 간다.
  await ctx.emit({ type: 'caption-changed', payload: { textKey: 'caption.place' } });
  const next = starts.slice();
  for (let i = 0; i < values.length; i += 1) {
    if (!(await gate())) return false;
    const value = values[i];
    const slot = next[value];
    next[value] = slot + 1;
    await ctx.emit({
      type: 'place',
      target: `index:${i}`,
      payload: {
        index: i,
        value,
        slot,
        bucketFull: next[value] >= starts[value] + counts[value],
      },
    });
  }

  await ctx.emit({ type: 'caption-changed', payload: { textKey: 'caption.done' } });
  await ctx.emit({ type: 'done' });
  return true;
}

export const countThenPlaceAlgorithm = async (
  ctx: FacetContext<CountThenPlaceData>,
): Promise<void> => {
  const rctx = ctx as ReactiveContext<CountThenPlaceData>;
  const stepMs = rctx.data.stepMs;

  const autoGate: Gate = async () => (await rctx.sleep(stepMs)) && !rctx.cancelled;
  if (!(await playThrough(rctx, autoGate))) return;

  // 자동 재생이 끝났다. 이제 곱씹어 보는 사람의 차례다.
  for (;;) {
    if (!(await waitAdvance(rctx))) return;
    await rctx.emit({ type: 'rewind' });
    // 되감기 직후의 첫 문은 그냥 통과시킨다. 되감기만 하고 멈추면 눌러도
    // 반응이 없는 것으로 읽힌다 (S-piece).
    let firstGate = true;
    const manualGate: Gate = async () => {
      if (firstGate) {
        firstGate = false;
        return !rctx.cancelled;
      }
      return waitAdvance(rctx);
    };
    if (!(await playThrough(rctx, manualGate))) return;
  }
};
