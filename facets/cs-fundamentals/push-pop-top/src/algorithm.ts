/**
 * push-pop-top — 한쪽 끝으로만 넣고 뺀다 (LIFO).
 *
 * 조각(piece). 한 질문에만 답한다 — "드나드는 문이 하나뿐이면 무슨 일이
 * 벌어지는가". 걸음마다 값이 문으로 들어가 쌓이고, 아래에 깔린 값은 위가
 * 걷히기 전에는 손이 닿지 않으며, 걷히는 차례는 들어온 차례의 반대다.
 *
 * ── 진행 동력
 * `mechanismKind: 'reactive'`. mount 즉시 스스로 재생하고 (ReactiveMechanism.init
 * 의 ensureStarted), 걸음 간격은 `ctx.sleep(initialData.stepMs)` 로 스스로 정한다.
 * 자동 재생이 끝나면 `waitForInput` 루프에 들어가 control-bar 의 `advance` 로
 * 한 걸음씩 다시 짚는다. 처음으로 돌아가는 걸음에서 `rewind` 를 먼저 발신한다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장. `done` 만 표준)
 *
 * | type            | payload                                        | silent |
 * |-----------------|------------------------------------------------|--------|
 * | `stage-ready`   | `{ top: number }`                              | no     |
 * | `push-enter`    | `{ value: number; slot: number; top: number }`  | no     |
 * | `probe-blocked` | `{ value: number; slot: number; topSlot: number; blocker: number }` | no |
 * | `pop-exit`      | `{ value: number; slot: number; top: number; blocker?: number }`    | no |
 * | `rewind`        | 없음                                            | no     |
 * | `done`          | `{ top: number }`                              | no     |
 *
 * - `slot` 은 통의 자리 번호 (0 = 바닥). 이 조각은 빈 통에서 시작해 한 번씩만
 *   쌓으므로 자리 번호가 곧 들어온 차례다.
 * - `top` 은 그 걸음이 끝난 뒤의 꼭대기 지표 (쌓인 개수).
 * - `blocker` 는 "이것이 걷혀야 손이 닿는다" 는 값. `probe-blocked` 에서는 막고
 *   있는 값, `pop-exit` 에서는 방금 걷혀서 길을 터 준 값.
 * - target 은 쓰지 않는다. 자리 번호의 정본은 payload.slot 이다.
 * - 화면 문안은 없다. 캡션 문구는 projector 가 키로 조회한다 (C10).
 *
 * ── 메트릭
 * 없다. 조각은 셀 것이 없으므로 `ctx.metric` 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PushPopTopData = {
  type: 'push-pop-top';
  /** 넣는 차례. 마지막 값이 꼭대기가 된다. */
  pushes: number[];
  /** 위가 걷히기 전에는 꺼낼 수 없음을 보일 자리 (0 = 바닥). */
  buriedSlot: number;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
  /** 곱씹어야 하는 걸음 뒤에 더 머무는 시간 (ms). */
  holdMs: number;
};

/** 걸음 수 — 되감기(0) 부터 결론(8) 까지. */
const LAST_BEAT = 8;

export const pushPopTopAlgorithm = async (
  ctx: FacetContext<PushPopTopData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<PushPopTopData>;
  const { pushes, buriedSlot, stepMs, holdMs } = rc.data;
  const first = pushes[0];
  const second = pushes[1];
  const third = pushes[2];
  const buried = pushes[buriedSlot];

  /** 취소 검사와 시간 흐름을 묶는다. false 면 그만둔다. */
  const pause = async (ms: number): Promise<boolean> => {
    if (rc.cancelled) return false;
    return rc.sleep(ms);
  };

  // ── 걸음 하나하나. emit 의 type 은 리터럴이다 (C2).
  const beatRewind = async (): Promise<void> => {
    await rc.emit({ type: 'rewind' });
  };
  const beatReady = async (): Promise<void> => {
    await rc.emit({ type: 'stage-ready', payload: { top: 0 } });
  };
  const beatPushFirst = async (): Promise<void> => {
    await rc.emit({ type: 'push-enter', payload: { value: first, slot: 0, top: 1 } });
  };
  const beatPushSecond = async (): Promise<void> => {
    await rc.emit({ type: 'push-enter', payload: { value: second, slot: 1, top: 2 } });
  };
  const beatPushThird = async (): Promise<void> => {
    await rc.emit({ type: 'push-enter', payload: { value: third, slot: 2, top: 3 } });
  };
  const beatBlocked = async (): Promise<void> => {
    await rc.emit({
      type: 'probe-blocked',
      payload: { value: buried, slot: buriedSlot, topSlot: 2, blocker: third },
    });
  };
  const beatPopThird = async (): Promise<void> => {
    await rc.emit({ type: 'pop-exit', payload: { value: third, slot: 2, top: 2 } });
  };
  const beatPopSecond = async (): Promise<void> => {
    await rc.emit({
      type: 'pop-exit',
      payload: { value: second, slot: 1, top: 1, blocker: third },
    });
  };
  const beatPopFirst = async (): Promise<void> => {
    await rc.emit({ type: 'pop-exit', payload: { value: first, slot: 0, top: 0 } });
  };
  const beatDone = async (): Promise<void> => {
    await rc.emit({ type: 'done', payload: { top: 0 } });
  };

  // ── 1. 자동 재생. 문제(문이 하나) → 장치(쌓기) → 막힘 → 결과(반대 차례).
  await beatReady();
  if (!(await pause(stepMs))) return;
  await beatPushFirst();
  if (!(await pause(stepMs))) return;
  await beatPushSecond();
  if (!(await pause(stepMs))) return;
  await beatPushThird();
  if (!(await pause(stepMs))) return;
  await beatBlocked();
  if (!(await pause(holdMs))) return;
  await beatPopThird();
  if (!(await pause(stepMs))) return;
  await beatPopSecond();
  if (!(await pause(holdMs))) return;
  await beatPopFirst();
  if (!(await pause(stepMs))) return;
  await beatDone();

  // ── 2. 자동 재생이 끝났다. 곱씹고 싶은 사람을 위해 한 걸음씩 다시 짚는다.
  //      화면은 이미 할 말을 마쳤으므로 눌러야 완성되는 조작이 아니다.
  let cursor = 0;
  for (;;) {
    if (rc.cancelled) return;
    const input = await rc.waitForInput().catch(() => null);
    if (input === null || rc.cancelled) return;
    if (input.type !== 'advance') continue;

    switch (cursor) {
      case 0:
        await beatRewind();
        await beatReady();
        break;
      case 1:
        await beatPushFirst();
        break;
      case 2:
        await beatPushSecond();
        break;
      case 3:
        await beatPushThird();
        break;
      case 4:
        await beatBlocked();
        break;
      case 5:
        await beatPopThird();
        break;
      case 6:
        await beatPopSecond();
        break;
      case 7:
        await beatPopFirst();
        break;
      case 8:
        await beatDone();
        break;
      default:
        break;
    }
    cursor = cursor >= LAST_BEAT ? 0 : cursor + 1;
  }
};
