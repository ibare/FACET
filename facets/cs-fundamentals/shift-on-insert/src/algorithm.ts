/**
 * shift-on-insert — 가운데에 넣으면 뒤가 밀린다 (조각).
 *
 * 이 조각이 답하는 질문 하나: **배열 가운데에 값을 넣으면 무슨 일이 벌어지는가.**
 * 동사는 "밀린다" 다. 뒤의 값들이 실제로 오른쪽으로 한 칸씩 옮겨 가고, 뒤에서부터
 * 옮겨야 앞의 값이 덮이지 않으며, 자리를 비운 다음에야 새 값이 들어온다.
 *
 * 진행 메커니즘은 reactive (S-piece). mount 시 스스로 자동 재생하고, 걸음 간격은
 * `initialData.stepMs` 를 `ctx.sleep` 으로 소비한다. 자동 재생이 끝나면
 * `waitForInput` 루프로 들어가 control-bar 의 `advance` 를 받아 처음부터 한 걸음씩
 * 다시 짚는다.
 *
 * ── 식별자
 *   index:<n>      배열의 n 번 칸.
 *
 * ── 이벤트 (전부 이 facet 고유 확장. silent 없음 — 모두 화면이 바뀐다)
 *   plan-insert    { targetIndex: number; incoming: number; occupied: number }
 *                  넣을 자리를 지목한다. 그 자리는 이미 `occupied` 가 쓰고 있다 (문제 제시).
 *   shift-cell     { from: number; to: number; value: number; moves: number }
 *                  from 칸의 값이 to 칸으로 한 칸 옮겨 간다. 뒤에서부터 나오므로
 *                  to 는 언제나 비어 있다 — 그래서 아무 값도 덮이지 않는다.
 *   slot-cleared   { index: number }
 *                  목표 칸이 비었다. 새 값은 이 다음에야 들어갈 수 있다.
 *   place-value    { index: number; value: number }
 *                  비워 둔 칸에 새 값이 들어간다.
 *   done           { moves: number }
 *                  한 번 넣는 데 몇 개를 옮겼는지 (표준 이벤트).
 *   rewind         (payload 없음)
 *                  걸음 모드에서 처음 상태로 되돌린다.
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없으므로 `ctx.metric` 을 부르지 않는다 (S-piece / C5 무대상).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ShiftOnInsertData = {
  type: string;
  /** 값이 든 칸들. 앞에서부터 빈틈 없이 채워져 있다. */
  values: number[];
  /** 배열이 잡아 둔 칸 수. values 보다 커야 밀어 넣을 자리가 있다. */
  capacity: number;
  /** 새 값을 넣을 자리. */
  targetIndex: number;
  /** 넣을 값. */
  incoming: number;
  /** 걸음 사이에 읽을 시간을 주는 간격 (ms). 저작 결정이라 선언에 둔다. */
  stepMs: number;
};

export async function shiftOnInsert(ctx: FacetContext<ShiftOnInsertData>): Promise<void> {
  const rc = ctx as ReactiveContext<ShiftOnInsertData>;

  /** true 면 걸음 모드 — 다음 걸음을 `advance` 입력이 끌고 간다. */
  let manual = false;

  /** 한 걸음 쉼. 취소되었으면 false 를 돌려 호출부가 즉시 빠져나가게 한다. */
  const pause = async (): Promise<boolean> => {
    if (manual) {
      // reset/destroy 는 대기를 reject 한다. 여기서 접어야 코어의 내부
      // sentinel 에 기대지 않는다.
      try {
        await rc.waitForInput();
      } catch {
        return false;
      }
      return !rc.cancelled;
    }
    return rc.sleep(rc.data.stepMs);
  };

  const play = async (): Promise<void> => {
    const values = [...rc.data.values];
    const capacity = rc.data.capacity;
    const at = rc.data.targetIndex;
    const incoming = rc.data.incoming;

    if (values.length >= capacity) {
      throw new Error(`밀어 넣을 빈 칸이 없다: 용량 ${capacity}, 값 ${values.length} 개`);
    }

    // 1. 문제 — 넣으려는 자리가 이미 차 있다.
    await ctx.emit({
      type: 'plan-insert',
      target: `index:${at}`,
      payload: { targetIndex: at, incoming, occupied: values[at] },
    });
    if (!(await pause())) return;

    // 2. 장치 — 뒤에서부터 한 칸씩 민다. 목적지가 언제나 비어 있으므로 덮이지 않는다.
    //    이 되풀이 자체가 이 조각의 주장이라 걸음을 펴지 않고 뒤에서 앞으로 돈다.
    let moves = 0;
    for (let from = values.length - 1; from >= at; from -= 1) {
      if (ctx.cancelled) return;
      moves += 1;
      await ctx.emit({
        type: 'shift-cell',
        target: `index:${from + 1}`,
        payload: { from, to: from + 1, value: values[from], moves },
      });
      if (!(await pause())) return;
    }

    // 3. 자리를 비운 다음에야 새 값이 들어온다.
    await ctx.emit({ type: 'slot-cleared', target: `index:${at}`, payload: { index: at } });
    if (!(await pause())) return;

    await ctx.emit({ type: 'place-value', target: `index:${at}`, payload: { index: at, value: incoming } });
    if (!(await pause())) return;

    // 4. 결과 — 하나를 넣는 값으로 치른 이동 횟수.
    await ctx.emit({ type: 'done', payload: { moves } });
  };

  await play();

  // 자동 재생이 끝났다. 이제부터는 누르는 만큼만 나아간다 (S-piece — 눌러야
  // 완성되는 화면이 아니라, 곱씹고 싶은 사람을 위한 두 번째 통로).
  manual = true;
  for (;;) {
    if (ctx.cancelled) return;
    try {
      await rc.waitForInput();
    } catch {
      return;
    }
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'rewind' });
    await play();
  }
}
