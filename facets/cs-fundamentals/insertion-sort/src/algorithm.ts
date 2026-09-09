/**
 * 삽입 정렬 — 왼쪽은 이미 줄이 서 있고, 오른쪽에서 값을 하나씩 가져와 그 줄에
 * 끼워 넣는다.
 *
 * 두 축을 말한다.
 *   1. **끼워 넣을 자리는 뒤에서부터 찾는다** — 값을 손에 들고, 그보다 큰 것을
 *      만나는 동안 그것들을 한 칸씩 오른쪽으로 비켜세운다. 비켜선 자리가 곧
 *      들고 있던 값이 내려앉을 자리다.
 *   2. **이미 줄 선 입력에서는 거의 일하지 않는다** — 자기보다 작은 것을 만나는
 *      순간 멈추므로 왼쪽 끝까지 가지 않는다. 90 을 넣을 때 비켜섬이 0 인 것이
 *      그 성격이다.
 *
 * 맞바꿈이 아니라 **밀기** 다. `arr[j + 1] = arr[j]` 는 오른쪽을 덮어쓸 뿐
 * 왼쪽에서 값을 가져오지 않는다 — 그 자리는 빈 자리(gap)가 되어 왼쪽으로
 * 걸어간다. 선택 정렬과 갈리는 자리가 여기다.
 *
 * 식별자 (C1): `index:<i>` 만 쓴다. 배열의 칸 번호가 전부다.
 *
 * 이벤트 (C2):
 *   - phase          payload { phase }                                     silent: true
 *   - pass-begin     target `index:<i>`      payload { i, key, sortedEnd }
 *   - highlight      target `index:<j>`      payload { kind: 'comparing', index, value, key }
 *   - state-changed  target [`index:<from>`, `index:<to>`]
 *                                            payload { kind: 'shift', from, to, value }
 *   - state-changed  target `index:<slot>`   payload { kind: 'place', index, value }
 *   - scan-stop      target `index:<j>`?     payload { reason: 'smaller' | 'left-edge',
 *                                                     index?, value?, key, slot }
 *   - pass-end       target `index:<slot>`   payload { i, slot, key, shifts, sortedEnd }
 *   - done           payload { compares, shifts, inserts }
 *
 * `unhighlight` 를 쓰지 않는다. 견줌 표시는 바로 다음 걸음 — 비켜섬이거나
 * 멈춤 — 이 곧바로 거두므로, 거두기만 하는 걸음을 따로 두면 재생이 한 박자씩
 * 헛돈다. projector 가 `state-changed` / `scan-stop` 에서 견줌 표시를 끈다.
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'pick-key' | 'compare' | 'shift' | 'place' | 'settle'
 *
 * 메트릭 (C5): 'compare-count' · 'shift-count' · 'insert-count'
 *
 * 견줌은 `arr[j] > key` 를 실제로 따져 본 횟수만 센다. `j >= 0` 은 자리 범위를
 * 지키는 검사이지 두 값을 견주는 일이 아니라서, 왼쪽 끝을 넘어서며 루프를
 * 빠져나가는 것은 견줌으로 세지 않는다. IR 이 안쪽을 `if arr[j] <= key: break`
 * 로 펼쳐 둔 것도 그래서다 — 견줌 한 번이 코드 한 줄과 정확히 맞물린다.
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type InsertionSortData = { type: 'array'; values: number[] };

export async function insertionSort(ctx: FacetContext<InsertionSortData>): Promise<void> {
  const arr = ctx.data.values;
  let compares = 0;
  let shifts = 0;
  let inserts = 0;

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  for (let i = 1; i < arr.length; i++) {
    if (ctx.cancelled) return;

    await phase('pick-key');
    const key = arr[i];
    let j = i - 1;
    let passShifts = 0;
    await ctx.emit({
      type: 'pass-begin',
      target: `index:${i}`,
      payload: { i, key, sortedEnd: i - 1 },
    });

    // 뒤에서부터 자리를 찾는다. 두 갈래로 끝난다 — 작은 것을 만나거나, 왼쪽 끝을
    // 넘어서거나. IR 의 `while j >= 0` + `if arr[j] <= key: break` 와 같은 모양이다.
    for (;;) {
      if (ctx.cancelled) return;

      if (j < 0) {
        await ctx.emit({
          type: 'scan-stop',
          payload: { reason: 'left-edge', key, slot: 0 },
        });
        break;
      }

      await phase('compare');
      compares++;
      ctx.metric('compare-count', 'inc');
      await ctx.emit({
        type: 'highlight',
        target: `index:${j}`,
        payload: { kind: 'comparing', index: j, value: arr[j], key },
      });

      if (arr[j] <= key) {
        await ctx.emit({
          type: 'scan-stop',
          target: `index:${j}`,
          payload: { reason: 'smaller', index: j, value: arr[j], key, slot: j + 1 },
        });
        break;
      }

      await phase('shift');
      const moved = arr[j];
      arr[j + 1] = moved;
      passShifts++;
      shifts++;
      ctx.metric('shift-count', 'inc');
      await ctx.emit({
        type: 'state-changed',
        target: [`index:${j}`, `index:${j + 1}`],
        payload: { kind: 'shift', from: j, to: j + 1, value: moved },
      });
      j--;
    }

    if (ctx.cancelled) return;

    await phase('place');
    const slot = j + 1;
    arr[slot] = key;
    inserts++;
    ctx.metric('insert-count', 'inc');
    await ctx.emit({
      type: 'state-changed',
      target: `index:${slot}`,
      payload: { kind: 'place', index: slot, value: key },
    });

    await phase('settle');
    await ctx.emit({
      type: 'pass-end',
      target: `index:${slot}`,
      payload: { i, slot, key, shifts: passShifts, sortedEnd: i },
    });
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done', payload: { compares, shifts, inserts } });
}
