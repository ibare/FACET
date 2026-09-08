/**
 * grow-and-copy — 재할당 조각(piece) 알고리즘.
 *
 * 한 장면만 말한다. 꽉 찬 자리에 하나를 더 넣으려다 막히고, 두 배짜리 자리를
 * 새로 얻고, 있던 값을 하나씩 옮겨 담고, 옛 자리를 버리고, 남은 칸에 새 값을
 * 쓴다. 주소가 바뀐다.
 *
 * 식별자
 *   index:<n>   블록 안 n 번째 칸. n === oldCapacity 는 "없는 다섯째 칸".
 *
 * 이벤트 (전부 이 facet 고유 확장 + 표준 `done`)
 *   insert-blocked  { value: number; capacity: number }
 *                   꽉 찬 블록에 value 를 넣으려다 막혔다. silent 아님.
 *   block-allocated { address: string; capacity: number; bytes: number }
 *                   더 큰 블록을 새로 얻었다. silent 아님.
 *   value-copied    { index: number; value: number; done: number; total: number }
 *                   옛 블록 index 칸의 값을 새 블록 같은 index 로 복사했다. silent 아님.
 *   block-freed     { address: string; movedTo: string }
 *                   옛 블록을 버렸다. 배열은 movedTo 주소에 산다. silent 아님.
 *   value-appended  { index: number; value: number }
 *                   막혔던 값이 새 블록의 index 칸에 들어갔다. silent 아님.
 *   done            { capacity: number; size: number; free: number }
 *                   최종 상태. silent 아님.
 *   rewind          {}  처음 상태로 되감는다 (한 걸음씩 보기 시작). silent 아님.
 *
 * phase / metric 없음 — 조각은 셀 것이 없다 (S-piece).
 *
 * 이 조각은 값 넷(용량 4) → 용량 8 한 장면만 말하므로 복사 네 번을 배열 순회가
 * 아니라 네 줄로 편다 (C2: emit type 은 리터럴).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GrowAndCopyData = {
  type: 'grow-and-copy';
  /** 걸음 간격. 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
  /** 원소 하나의 바이트 수. int32 = 4. 블록 바이트 수는 여기서 곱해 얻는다. */
  elementBytes: number;
  /** 옛 블록 주소 표기. */
  oldAddress: string;
  /** 옛 블록 용량 — 값 개수와 같다 (꽉 찬 상태). */
  oldCapacity: number;
  /** 옛 블록에 들어 있는 값 넷. */
  values: number[];
  /** 새 블록 주소 표기. */
  newAddress: string;
  /** 새 블록 용량 — 옛 용량의 두 배. */
  newCapacity: number;
  /** 더 넣으려는 값. */
  incoming: number;
};

const DEFAULT_STEP_MS = 780;

export const growAndCopy = async (ctx: FacetContext<GrowAndCopyData>): Promise<void> => {
  const rc = ctx as ReactiveContext<GrowAndCopyData>;
  const d = rc.data;
  const stepMs = typeof d.stepMs === 'number' && d.stepMs > 0 ? d.stepMs : DEFAULT_STEP_MS;

  /** 자동 재생을 마친 뒤에는 걸음마다 사용자의 `advance` 를 기다린다. */
  let manual = false;

  /** 취소 검사 + 다음 걸음까지의 간격. false 면 알고리즘을 접는다. */
  const pause = async (): Promise<boolean> => {
    if (rc.cancelled) return false;
    if (!manual) return rc.sleep(stepMs);
    for (;;) {
      const input = await rc.waitForInput();
      if (rc.cancelled) return false;
      if (input.type === 'advance') return true;
    }
  };

  const [v0, v1, v2, v3] = d.values;
  const total = d.values.length;
  const bytes = d.newCapacity * d.elementBytes;

  const play = async (): Promise<boolean> => {
    if (!(await pause())) return false;
    await rc.emit({
      type: 'insert-blocked',
      target: `index:${d.oldCapacity}`,
      payload: { value: d.incoming, capacity: d.oldCapacity },
    });

    if (!(await pause())) return false;
    await rc.emit({
      type: 'block-allocated',
      payload: { address: d.newAddress, capacity: d.newCapacity, bytes },
    });

    if (!(await pause())) return false;
    await rc.emit({
      type: 'value-copied',
      target: 'index:0',
      payload: { index: 0, value: v0, done: 1, total },
    });

    if (!(await pause())) return false;
    await rc.emit({
      type: 'value-copied',
      target: 'index:1',
      payload: { index: 1, value: v1, done: 2, total },
    });

    if (!(await pause())) return false;
    await rc.emit({
      type: 'value-copied',
      target: 'index:2',
      payload: { index: 2, value: v2, done: 3, total },
    });

    if (!(await pause())) return false;
    await rc.emit({
      type: 'value-copied',
      target: 'index:3',
      payload: { index: 3, value: v3, done: 4, total },
    });

    if (!(await pause())) return false;
    await rc.emit({
      type: 'block-freed',
      payload: { address: d.oldAddress, movedTo: d.newAddress },
    });

    if (!(await pause())) return false;
    await rc.emit({
      type: 'value-appended',
      target: `index:${total}`,
      payload: { index: total, value: d.incoming },
    });

    if (!(await pause())) return false;
    await rc.emit({
      type: 'done',
      payload: {
        capacity: d.newCapacity,
        size: total + 1,
        free: d.newCapacity - total - 1,
      },
    });
    return true;
  };

  try {
    if (!(await play())) return;

    // 자동 재생이 끝났다. 이제부터는 눌린 만큼만 나아간다 — 첫 누름은 처음으로
    // 되감고, 그 뒤로는 한 걸음씩 (S-piece: CONTROL.advance).
    for (;;) {
      const input = await rc.waitForInput();
      if (rc.cancelled) return;
      if (input.type !== 'advance') continue;
      manual = true;
      await rc.emit({ type: 'rewind' });
      if (!(await play())) return;
    }
  } catch {
    // waitForInput 은 취소 시 reject 한다. 조각은 여기서 조용히 접는다.
  }
};
