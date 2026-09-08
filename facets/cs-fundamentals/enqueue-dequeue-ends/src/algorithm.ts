/**
 * enqueue-dequeue-ends — 한쪽으로 넣고 반대쪽으로 뺀다 (조각).
 *
 * 이 조각이 답하는 질문 하나: **드나드는 문이 서로 반대편이면 차례가 어떻게 되는가.**
 * 동사는 "흘러간다" 다. 값은 뒤쪽 문으로 들어와 줄을 따라 앞으로 나아가고 앞쪽 문으로
 * 빠진다. 줄에 있는 것은 언제나 같은 방향으로만 움직이며 서로를 앞지르지 못한다.
 * 그래서 먼저 들어온 것이 먼저 나온다.
 *
 * 진행 메커니즘은 reactive (S-piece). mount 시 스스로 재생을 시작하고 걸음 간격은
 * `initialData.stepMs` 를 `ctx.sleep` 으로 소비한다. 자동 재생을 마치면 `waitForInput`
 * 루프로 들어가 control-bar 의 `advance` 를 한 걸음씩 받는다 — 첫 입력에서 `rewind` 로
 * 처음 상태로 되감고, 그 뒤로는 같은 걸음을 하나씩 다시 짚는다.
 *
 * ── 식별자
 *   queue          값이 늘어선 줄 하나. 이 조각에는 줄이 하나뿐이라 인덱스를 붙이지 않는다.
 *
 * ── 이벤트 (silent 없음 — 모두 화면이 바뀐다)
 *   lane-ready     payload 없음. 표준 어휘 아님 (이 facet 고유).
 *                  줄과 두 문을 짚는다. 문이 둘이고 서로 반대편이라는 전제를 세우는 도입 걸음.
 *   enqueue        target 'queue' · { value: number; order: number }   (표준 어휘)
 *                  뒤쪽 문으로 value 가 들어온다. order 는 몇 번째로 들어왔는지 (0-based) —
 *                  줄에서 어디에 서는지가 이 값으로 정해진다.
 *   dequeue        target 'queue' · { value: number }                  (표준 어휘)
 *                  앞쪽 문으로 value 가 빠진다. 남은 것은 전부 한 칸씩 앞으로 나아간다.
 *   done           { inOrder: number[]; outOrder: number[] }           (표준 어휘)
 *                  들어간 차례와 나온 차례. 둘은 실제 큐 연산의 결과이지 미리 적어 둔 값이 아니다.
 *   rewind         payload 없음. 표준 어휘 아님 (이 facet 고유).
 *                  걸음 모드에서 처음 상태로 되감는다.
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없으므로 `ctx.metric` 을 부르지 않는다 (S-piece / C5 무대상).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EnqueueDequeueEndsData = {
  type: 'enqueue-dequeue-ends';
  /** 뒤쪽 문으로 넣을 값. 넣는 차례 그대로다. */
  values: number[];
  /** 걸음 사이에 두는 시간 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 걸음과 걸음 사이의 문지방. false 면 중단 (취소됨). */
type Gate = () => Promise<boolean>;

/** 앞쪽 문에서 하나를 뺀다. 큐가 비었으면 그림이 거짓말을 하기 전에 멈춘다 (C6). */
function takeFront(lane: number[]): number {
  const front = lane.shift();
  if (front === undefined) {
    throw new Error('enqueue-dequeue-ends: 줄이 비었는데 앞쪽 문에서 빼려 했다');
  }
  return front;
}

/**
 * 한 번의 흐름 — 문 짚기 → 뒤로 셋 넣기 → 앞으로 셋 빼기 → 차례 대조.
 *
 * 걸음을 배열로 순회하지 않고 한 줄씩 편다 (C2 / S-piece). 넣고 빼는 값은 실제
 * 배열 연산 (`push` / `shift`) 에서 나오므로 나온 차례를 미리 적어 두지 않는다.
 */
async function playFlow(
  ctx: ReactiveContext<EnqueueDequeueEndsData>,
  gate: Gate,
): Promise<boolean> {
  const [first, second, third] = ctx.data.values;
  const lane: number[] = [];
  const out: number[] = [];

  await ctx.emit({ type: 'lane-ready' });
  if (!(await gate())) return false;

  lane.push(first);
  await ctx.emit({ type: 'enqueue', target: 'queue', payload: { value: first, order: 0 } });
  if (!(await gate())) return false;

  lane.push(second);
  await ctx.emit({ type: 'enqueue', target: 'queue', payload: { value: second, order: 1 } });
  if (!(await gate())) return false;

  lane.push(third);
  await ctx.emit({ type: 'enqueue', target: 'queue', payload: { value: third, order: 2 } });
  if (!(await gate())) return false;

  out.push(takeFront(lane));
  await ctx.emit({ type: 'dequeue', target: 'queue', payload: { value: out[0] } });
  if (!(await gate())) return false;

  out.push(takeFront(lane));
  await ctx.emit({ type: 'dequeue', target: 'queue', payload: { value: out[1] } });
  if (!(await gate())) return false;

  out.push(takeFront(lane));
  await ctx.emit({ type: 'dequeue', target: 'queue', payload: { value: out[2] } });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'done',
    payload: { inOrder: [first, second, third], outOrder: out },
  });
  return true;
}

/**
 * 자동으로 한 번 흐르고, 그 뒤로는 `advance` 를 받을 때마다 한 걸음씩 다시 흐른다.
 */
export const enqueueDequeueEndsAlgorithm = async (
  ctx: FacetContext<EnqueueDequeueEndsData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<EnqueueDequeueEndsData>;
  const { values, stepMs } = rc.data;

  if (values.length !== 3) {
    throw new Error(
      `enqueue-dequeue-ends: 값 셋을 전제하는 조각인데 ${values.length} 개를 받았다`,
    );
  }

  const bySleep: Gate = () => rc.sleep(stepMs);
  const byHand: Gate = async () => {
    await rc.waitForInput();
    return !rc.cancelled;
  };

  if (!(await playFlow(rc, bySleep))) return;

  for (;;) {
    if (rc.cancelled) return;
    await rc.waitForInput();
    if (rc.cancelled) return;
    await rc.emit({ type: 'rewind' });
    if (!(await playFlow(rc, byHand))) return;
  }
};
