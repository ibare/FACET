/**
 * traverse-from-head — 순차 접근 조각(piece).
 *
 * 답하는 질문 하나: **네 번째 노드에 닿으려면 무엇을 해야 하는가.**
 * head 에서 시작해 링크를 하나씩 따라가는 것 말고는 길이 없다.
 *
 * ── 이벤트 (표준 어휘 + facet 고유 확장)
 *
 *   mark          target `node:<i>`  payload `{ index: number }`
 *                 찾아갈 노드를 표시한다. (표준)
 *   jump-attempt  payload `{ from: number; to: number }`
 *                 주소를 셈해 곧장 건너뛰려는 시도. 화살이 뻗다가 되돌아온다. (고유)
 *   cursor-move   target `node:<to>`  payload `{ from: number; to: number; hops: number }`
 *                 커서가 링크 하나를 따라 옆 노드로 옮겨 간다. (고유)
 *   done          payload `{ index: number; hops: number; visited: number }`
 *                 목표 노드 도착. 옮긴 횟수와 거쳐 온 노드 수를 함께 알린다. (표준)
 *   rewind        payload 없음
 *                 화면을 처음 상태로 되돌린다. 한 걸음씩 되짚기 직전에 발신. (고유)
 *
 *   silent 이벤트는 없다. 여섯 걸음 모두 화면이 바뀐다.
 *
 * ── 진행
 *
 *   reactive 메커니즘. mount 즉시 자동 재생하고 (`ctx.sleep(stepMs)`), 끝나면
 *   `advance` 입력을 기다렸다가 `rewind` 후 같은 걸음을 하나씩 되짚는다.
 *   눌러야 완성되는 화면이 아니다 — 자동 재생만 보고 지나가도 할 말은 끝난다.
 *
 * ── 걸음이 데이터에 묶여 있다
 *
 *   걸음을 배열로 돌리지 않고 한 줄씩 폈다 (C2 / S-piece). 그래서 선언된 데이터
 *   — 다섯 노드 `[3, 8, 1, 6, 4]`, 목표 인덱스 3 — 와 세 번의 옮김이 짝을 이룬다.
 *   initialData 를 바꾸면 아래 `play` 의 줄도 함께 고쳐야 한다.
 *
 * 메트릭은 쓰지 않는다 (조각은 셀 것이 없다).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TraverseFromHeadData = {
  type: 'traverse-from-head';
  /** 노드에 담긴 값. 화면의 상자에 그대로 쓰인다. */
  values: number[];
  /** 찾아갈 노드의 인덱스. */
  targetIndex: number;
  /** 걸음 사이 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
};

/** stepMs 가 선언되지 않은 채로 들어왔을 때의 최후 값. */
const FALLBACK_STEP_MS = 900;

/**
 * 한 걸음 앞에서 멈추는 방법.
 *
 * 자동 재생이면 `ctx.sleep`, 되짚기면 `advance` 대기. 걸음의 나열은 한 벌뿐이고
 * 멈추는 방법만 갈린다.
 *
 * @returns 계속 진행하면 true, 취소되었으면 false.
 */
type Pause = () => Promise<boolean>;

/** `advance` 입력 하나를 기다린다. 취소되면 false. */
async function waitForAdvance(ctx: ReactiveContext<TraverseFromHeadData>): Promise<boolean> {
  while (!ctx.cancelled) {
    try {
      const input = await ctx.waitForInput();
      if (input.type === 'advance') return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** 여섯 걸음. 멈추는 방법만 인자로 받고 순서는 언제나 같다. */
async function play(ctx: ReactiveContext<TraverseFromHeadData>, pause: Pause): Promise<void> {
  const target = ctx.data.targetIndex;

  // 1. 무엇이 필요한지 세운다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'mark', target: `node:${target}`, payload: { index: target } });

  // 2. 곧장 건너뛰어 본다 — 셈할 주소가 없어 되돌아온다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'jump-attempt', payload: { from: 0, to: target } });

  // 3~5. 링크를 하나씩 따라간다. 세 번 옮겨야 네 번째 노드다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'cursor-move', target: 'node:1', payload: { from: 0, to: 1, hops: 1 } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'cursor-move', target: 'node:2', payload: { from: 1, to: 2, hops: 2 } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'cursor-move', target: 'node:3', payload: { from: 2, to: 3, hops: 3 } });

  // 6. 도착. 옮김 3회, 거쳐 온 노드 4개.
  if (!(await pause())) return;
  await ctx.emit({ type: 'done', payload: { index: 3, hops: 3, visited: 4 } });
}

export const traverseFromHead = async (
  ctx: FacetContext<TraverseFromHeadData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<TraverseFromHeadData>;
  const stepMs = rc.data.stepMs > 0 ? rc.data.stepMs : FALLBACK_STEP_MS;

  // 자동 재생 — 걸음마다 읽을 시간을 두고 스스로 나아간다.
  await play(rc, () => rc.sleep(stepMs));

  // 그 뒤로는 곱씹는 사람을 위해 한 걸음씩. 첫 누름은 처음으로 되돌리는 데 쓴다.
  while (!rc.cancelled) {
    if (!(await waitForAdvance(rc))) return;
    await rc.emit({ type: 'rewind' });
    await play(rc, () => waitForAdvance(rc));
  }
};
