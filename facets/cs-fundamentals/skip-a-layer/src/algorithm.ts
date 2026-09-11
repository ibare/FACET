/**
 * skipALayer — 층이 여럿인 리스트에서 값을 찾는다 (조각).
 *
 * 값들은 오름차순으로 놓이고 각자 탑 높이를 갖는다. 높이 h 인 값은 층 0 부터
 * 층 h-1 까지에 선다. 가장 높은 층에서 출발해 다음 값을 보고 —
 *   찾는 값보다 작으면 그리로 옮겨 가고 (뛴다),
 *   크면 지나친 것이니 한 층 내려선다,
 *   같으면 찾은 것이다.
 *
 * 층별 구성도 자취도 여기서 높이 배열로부터 셈한다. 걸음표를 손으로 적지 않는다
 * (S-piece).
 *
 * ── 식별자
 *   column  값의 자리 번호 (`values` 의 인덱스). 층이 달라도 같은 값은 같은 column.
 *   level   층 번호. 0 이 맨 아래이고 큰 수가 위다.
 *
 * ── 이벤트 (전부 facet 고유 확장. silent 는 없다 — 모두 걸음의 경계다)
 *   seek-begin { target: number; level: number }
 *       여행자가 head 에, 가장 높은 층에 선다. 문(gate) 앞에 있는 유일한 발신이다.
 *   leap       { level: number; column: number; value: number; target: number }
 *       다음 값이 찾는 값보다 작다 — 그 자리로 뛴다.
 *   step-down  { level: number; toLevel: number; column: number | null;
 *                overColumn: number | null; overValue: number | null; target: number }
 *       한 층 내려선다. overColumn 이 있으면 그 값을 보고 지나쳐서이고,
 *       null 이면 이 층에 다음이 없어서다. column 은 내려서는 자리 (head 면 null).
 *   found      { level: number; column: number; value: number }
 *       찾았다.
 *   done       { looks: number; flatLooks: number; flatColumn: number }
 *       본 횟수와, 층이 하나뿐인 리스트로 처음부터 훑었을 때의 횟수.
 *   rewind     payload 없음
 *       되감는다. 자동 재생이 끝난 뒤 처음 누르는 `advance` 가 이것을 부른다.
 *
 * 메트릭은 없다 (조각은 셀 것이 없다 — S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SkipALayerData = {
  type: 'skip-a-layer';
  /** 오름차순 값들. 자리 번호(column)가 곧 이 배열의 인덱스다. */
  values: number[];
  /** 값마다의 탑 높이. 높이 h 인 값은 층 0 부터 층 h-1 까지에 선다. */
  heights: number[];
  /** 찾는 값. */
  target: number;
  /** 걸음 사이의 정지 시간 (S-piece). */
  stepMs: number;
};

export async function skipALayer(ctx: FacetContext<SkipALayerData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SkipALayerData>;
  const { values, heights, target, stepMs } = rctx.data;
  if (values.length === 0 || heights.length === 0) return;

  // 층별 구성을 높이에서 셈한다. lanes[level] = 그 층에 선 값들의 column.
  const topLevel = Math.max(...heights) - 1;
  const lanes: number[][] = [];
  for (let level = 0; level <= topLevel; level += 1) {
    const columns: number[] = [];
    for (let i = 0; i < values.length; i += 1) {
      if (heights[i] > level) columns.push(i);
    }
    lanes.push(columns);
  }

  // 층이 하나뿐인 리스트로 처음부터 훑으면 어디서 멈추는가 — 대조의 상대.
  let flatColumn = values.length - 1;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] >= target) {
      flatColumn = i;
      break;
    }
  }

  /** 자동 재생을 마쳤는가. 그 뒤로는 눌러야 나아간다. */
  let manual = false;
  /** 되감기 직후의 첫 문은 그냥 통과시킨다 — 첫 누름이 첫 걸음까지 가도록 (S-piece). */
  let freeGate = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  async function gate(): Promise<boolean> {
    if (rctx.cancelled) return false;
    if (!manual) return rctx.sleep(stepMs);
    if (freeGate) {
      freeGate = false;
      return true;
    }
    for (;;) {
      if (rctx.cancelled) return false;
      const input = await rctx.waitForInput();
      if (input.type !== 'advance') continue;
      return !rctx.cancelled;
    }
  }

  /** 한 회차. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  async function walk(): Promise<boolean> {
    // 첫 그림은 문 밖에 둔다 — 마운트 직후 stepMs 만큼 빈 화면을 보이지 않게.
    await rctx.emit({ type: 'seek-begin', payload: { target, level: topLevel } });

    let level = topLevel;
    let column: number | null = null;
    let looks = 0;

    for (;;) {
      if (rctx.cancelled) return false;
      const lane: number[] = lanes[level];
      // 자리를 적어 둔다 — `column` 이 아래에서 `nextColumn` 을 받으므로, 형을
      // 추론에 맡기면 둘이 서로를 물고 돈다 (TS7022).
      const pos: number = column === null ? -1 : lane.indexOf(column);
      const nextColumn: number | null = pos + 1 < lane.length ? lane[pos + 1] : null;

      if (nextColumn !== null && values[nextColumn] < target) {
        if (!(await gate())) return false;
        looks += 1;
        await rctx.emit({
          type: 'leap',
          payload: { level, column: nextColumn, value: values[nextColumn], target },
        });
        column = nextColumn;
        continue;
      }

      if (nextColumn !== null && values[nextColumn] === target) {
        if (!(await gate())) return false;
        looks += 1;
        await rctx.emit({
          type: 'found',
          payload: { level, column: nextColumn, value: values[nextColumn] },
        });
        break;
      }

      // 지나쳤거나(다음 값이 크다) 이 층에 다음이 없다. 어느 쪽이든 한 층 내려선다.
      // 맨 아래 층에서는 내려설 곳이 없다 — 리스트에 없는 값이라는 뜻이다.
      if (level === 0) break;
      if (!(await gate())) return false;
      if (nextColumn !== null) looks += 1;
      await rctx.emit({
        type: 'step-down',
        payload: {
          level,
          toLevel: level - 1,
          column,
          overColumn: nextColumn,
          overValue: nextColumn === null ? null : values[nextColumn],
          target,
        },
      });
      level -= 1;
    }

    if (!(await gate())) return false;
    await rctx.emit({
      type: 'done',
      payload: { looks, flatLooks: flatColumn + 1, flatColumn },
    });
    return true;
  }

  try {
    for (;;) {
      if (rctx.cancelled) return;
      if (!(await walk())) return;

      // 여기서부터는 눌러야 나아간다. 처음 누르는 `advance` 는 되감고 첫 걸음까지 간다.
      manual = true;
      for (;;) {
        if (rctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (input.type !== 'advance') continue;
        break;
      }
      if (rctx.cancelled) return;
      freeGate = true;
      await rctx.emit({ type: 'rewind' });
    }
  } catch (err) {
    // reset / destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
    // 그 밖의 오류는 올려 러너가 드러내게 둔다.
    if (!rctx.cancelled) throw err;
  }
}
