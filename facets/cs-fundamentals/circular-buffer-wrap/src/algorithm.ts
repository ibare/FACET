/**
 * 원형 버퍼 — 끝에 닿으면 앞으로 돌아온다 (조각).
 *
 * 답하는 질문 하나: **마지막 칸 다음은 어디인가.** 칸은 늘어나지 않고, 앞에서
 * 빠져나간 자리를 뒤에서 들어온 것이 다시 쓴다.
 *
 * ── 식별자
 *   index:<slot>   칸 번호 (0 ~ slots.length-1)
 *
 * ── 이벤트 (전부 facet 고유가 아닌 표준 어휘 + rewind 하나. 모두 silent 아님)
 *   enqueue  target `index:<slot>`
 *            payload { value: number; slot: number; from: number; to: number; wrapped: boolean }
 *            tail 이 slot 에 value 를 쓰고 from → to 로 나아간다.
 *   dequeue  target `index:<slot>`
 *            payload { value: number; slot: number; from: number; to: number; wrapped: boolean }
 *            head 가 slot 의 value 를 내보내고 from → to 로 나아간다.
 *   rewind   payload 없음. 손으로 짚어 보기가 처음으로 되감을 때.
 *   done     payload 없음. 마지막 캡션.
 *
 *   `wrapped` 는 to 가 from + 1 이 아니라 감겨서 온 자리라는 뜻이다. 화면의 운동은
 *   양쪽이 같고 (지표 트랙을 앞으로 미끄러진다) 캡션만 달라진다.
 *
 * ── 초기 배치와 걸음 (initialData 와 짝이 맞는 각본)
 *   처음     [_, _, _, 8, 2]   head=3  tail=0   ← tail 은 이미 한 바퀴 감겨 있다
 *   넣기 5 → 자리 0,  tail 0 → 1
 *   넣기 9 → 자리 1,  tail 1 → 2
 *   빼기   → 자리 3 의 8,  head 3 → 4
 *   빼기   → 자리 4 의 2,  head 4 → 0          ← 여기서 감긴다
 *   다음 자리 셈은 어느 걸음에서나 (i + 1) % 5 하나뿐이다.
 *
 * 걸음을 배열로 순회하면 emit 의 type 이 리터럴이 아니게 되므로 한 줄씩 편다 (C2).
 *
 * 초기 배치 자체는 emit 하지 않는다 — projector 의 onInit 이 ctx.data 를 받아 그린다.
 * 되감기도 같은 자리로 돌아가는 일이라 rewind 하나면 족하다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CircularBufferWrapData = {
  type: 'circular-buffer-wrap';
  /** 칸. null 은 빈 자리. 길이가 곧 칸 수이며 실행 중 늘어나지 않는다. */
  slots: (number | null)[];
  /** 다음 뺄 자리. */
  head: number;
  /** 다음 넣을 자리. */
  tail: number;
  /** 넣을 값. 차례대로 tail 자리에 쓴다. */
  incoming: number[];
  /** 걸음 사이 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** control-bar 의 `advance` 액션. ReactiveMechanism 이 dispatch 로 흘려 준다. */
const ADVANCE = 'advance';

/**
 * 한 걸음 사이를 여는 문.
 *
 * 자동 재생은 시간이 열고, 손으로 짚어 보기는 사람이 연다. 걸음 자체는 한 벌뿐이라
 * 두 재생 방식이 같은 순서를 본다. false 를 돌려주면 취소된 것이니 그 자리에서 멈춘다.
 */
type Gate = () => Promise<boolean>;

/**
 * 걸음 넷 — 넣기 둘, 빼기 둘. 마지막 빼기에서 head 가 감긴다.
 *
 * 자리와 감김 여부는 적어 두지 않고 `(i + 1) % 칸수` 로 셈한다. 감기는 걸음이
 * 특별하지 않다는 것이 이 조각의 주장이므로, 코드도 그 걸음을 특별히 적지 않는다.
 * 값은 `initialData` 가 정본이다 (원칙 2).
 */
async function runPass(
  ctx: ReactiveContext<CircularBufferWrapData>,
  gate: Gate,
): Promise<void> {
  const size = ctx.data.slots.length;
  const next = (i: number): number => (i + 1) % size;
  const slots = [...ctx.data.slots];
  let head = ctx.data.head;
  let tail = ctx.data.tail;

  for (const value of ctx.data.incoming) {
    if (ctx.cancelled) return;
    if (!(await gate())) return;
    const slot = tail;
    const to = next(slot);
    slots[slot] = value;
    tail = to;
    await ctx.emit({
      type: 'enqueue',
      target: `index:${slot}`,
      payload: { value, slot, from: slot, to, wrapped: to < slot },
    });
  }

  for (let n = 0; n < ctx.data.incoming.length; n += 1) {
    if (ctx.cancelled) return;
    if (!(await gate())) return;
    const slot = head;
    const value = slots[slot];
    if (value === null || value === undefined) {
      throw new Error(`빈 칸에서 뺄 수 없다 — ${slot}번 칸이 비어 있다`);
    }
    const to = next(slot);
    slots[slot] = null;
    head = to;
    await ctx.emit({
      type: 'dequeue',
      target: `index:${slot}`,
      payload: { value, slot, from: slot, to, wrapped: to < slot },
    });
  }

  if (!(await gate())) return;
  await ctx.emit({ type: 'done' });
}

/**
 * 자동으로 한 바퀴 보인 뒤, 누를 때마다 한 걸음씩 다시 짚는다.
 *
 * 자동 재생만 보고 지나가도 화면은 할 말을 마친다 — advance 는 곱씹으며 읽고 싶은
 * 사람을 위한 것이지 진행에 필요한 조작이 아니다 (S-piece).
 */
export const circularBufferWrap = async (
  base: FacetContext<CircularBufferWrapData>,
): Promise<void> => {
  const ctx = base as ReactiveContext<CircularBufferWrapData>;

  /** 시간이 여는 문 — 취소 검사까지 묶는다. */
  const bySleep: Gate = async () => (await ctx.sleep(ctx.data.stepMs)) && !ctx.cancelled;

  /** 사람이 여는 문 — advance 가 올 때까지 기다린다. */
  const byAdvance: Gate = async () => {
    while (!ctx.cancelled) {
      let input: { type: string };
      try {
        input = await ctx.waitForInput();
      } catch {
        // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다.
        return false;
      }
      if (input.type === ADVANCE) return !ctx.cancelled;
    }
    return false;
  };

  await runPass(ctx, bySleep);

  /**
   * 되감은 누름이 곧 첫 걸음이다 — 첫 문만 그냥 통과시킨다.
   *
   * runPass 는 문을 emit 앞에 두므로, 되감기 직후 그대로 넘기면 사람이 한 번
   * 더 눌러야 첫 걸음이 나온다. 눌렀는데 되감기만 하고 멈추면 반응이 없는
   * 것으로 읽힌다.
   */
  const openFirst = (gate: Gate): Gate => {
    let opened = false;
    return async () => {
      if (!opened) {
        opened = true;
        return !ctx.cancelled;
      }
      return gate();
    };
  };

  for (;;) {
    if (ctx.cancelled) return;
    if (!(await byAdvance())) return;
    await ctx.emit({ type: 'rewind' });
    await runPass(ctx, openFirst(byAdvance));
  }
};
