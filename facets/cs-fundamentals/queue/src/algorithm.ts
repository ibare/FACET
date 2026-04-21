/**
 * Queue (FIFO) 자료구조 시각화 알고리즘.
 *
 * 기획: 양끝 비대칭 게이트 / 입장 스탬프 / 나이 그라디언트 / 동기 시프트 /
 * 꼬리 로그 / 연산 로그 를 드러내는 큐 시뮬레이션. scenario 배열을 순회하며
 * enqueue / dequeue / peek 를 발신한다. bounded 모드에서는 capacity 도달 시
 * overflow, 빈 큐에서 dequeue 시 underflow 를 발신한다.
 *
 * 식별자 (C1):
 *   - `queue:front`   — 큐의 앞 게이트 / front 블록
 *   - `queue:rear`    — 큐의 뒤 게이트 / 최신 입장 위치
 *
 * 이벤트 (C2):
 *   표준:
 *     - enqueue   target: queue:rear      payload: { stamp, label, value, size, totalEnqueued }
 *     - dequeue   target: queue:front     payload: { stamp, label, value, size, time }
 *     - done
 *
 *   facet 로컬 (StandardEventType 에 미포함 — 향후 두 번째 사용처 생기면 승격):
 *     - peek       target: queue:front    payload: { stamp, label, value, time }
 *     - overflow   target: queue:rear     payload: { attempted: string, time, capacity }
 *     - underflow  target: queue:front    payload: { time }
 *
 *   메타 (silent):
 *     - phase     payload: { phase: 'enqueue' | 'dequeue' | 'peek' | 'overflow-check' | 'underflow-check' | 'scenario-loop' | 'done' }
 *
 * 메트릭 (C5):
 *   - 'enqueue-count'
 *   - 'dequeue-count'
 *   - 'peek-count'
 *   - 'overflow-count'
 *   - 'underflow-count'
 *
 * phase 어휘는 irs.ts 의 phase 필드와 일치 (C3).
 */

import type { FacetContext } from '@facet/core/runtime';

export type QueueOp =
  | { op: 'enqueue'; value: string }
  | { op: 'dequeue' }
  | { op: 'peek' };

export type QueueFacetData = {
  type: 'queue';
  /** 초기 큐에 들어있는 값 (enqueue 된 순서대로). */
  initialValues: string[];
  /** bounded 모드 최대 크기. null/생략 = 무한. */
  capacity: number | null;
  /** 자동 재생 시나리오 연산 목록. */
  scenario: QueueOp[];
};

export async function queue(ctx: FacetContext<QueueFacetData>): Promise<void> {
  const { initialValues, capacity, scenario } = ctx.data;

  // 내부 상태 — projector 에 주입되는 값과 완전히 같은 순서를 보장한다.
  type Entry = { stamp: number; value: string };
  const queueState: Entry[] = [];
  let nextStamp = 0;
  let time = 0;

  const isBounded = capacity !== null && Number.isFinite(capacity);

  // 0. 초기 큐 상태 주입 — 각 값을 enqueue 이벤트로 발신 (스탬프 #1 부터).
  for (const value of initialValues) {
    if (ctx.cancelled) return;
    nextStamp += 1;
    queueState.push({ stamp: nextStamp, value });
    await ctx.emit({ type: 'phase', payload: { phase: 'enqueue' }, silent: true });
    await ctx.emit({
      type: 'enqueue',
      target: 'queue:rear',
      payload: {
        stamp: nextStamp,
        label: value,
        value,
        size: queueState.length,
        totalEnqueued: nextStamp,
        time,
        initial: true,
      },
    });
    ctx.metric('enqueue-count', 'inc');
  }

  // 1. scenario 순회.
  for (const step of scenario) {
    if (ctx.cancelled) return;
    time += 1;

    await ctx.emit({
      type: 'phase',
      payload: { phase: 'scenario-loop' },
      silent: true,
    });

    if (step.op === 'enqueue') {
      // bounded 체크.
      if (isBounded && queueState.length >= (capacity as number)) {
        await ctx.emit({
          type: 'phase',
          payload: { phase: 'overflow-check' },
          silent: true,
        });
        await ctx.emit({
          type: 'overflow',
          target: 'queue:rear',
          payload: {
            attempted: step.value,
            time,
            capacity: capacity as number,
          },
        });
        ctx.metric('overflow-count', 'inc');
        continue;
      }
      nextStamp += 1;
      queueState.push({ stamp: nextStamp, value: step.value });
      await ctx.emit({ type: 'phase', payload: { phase: 'enqueue' }, silent: true });
      await ctx.emit({
        type: 'enqueue',
        target: 'queue:rear',
        payload: {
          stamp: nextStamp,
          label: step.value,
          value: step.value,
          size: queueState.length,
          totalEnqueued: nextStamp,
          time,
          initial: false,
        },
      });
      ctx.metric('enqueue-count', 'inc');
    } else if (step.op === 'dequeue') {
      if (queueState.length === 0) {
        await ctx.emit({
          type: 'phase',
          payload: { phase: 'underflow-check' },
          silent: true,
        });
        await ctx.emit({
          type: 'underflow',
          target: 'queue:front',
          payload: { time },
        });
        ctx.metric('underflow-count', 'inc');
        continue;
      }
      const front = queueState.shift();
      if (!front) continue;
      await ctx.emit({ type: 'phase', payload: { phase: 'dequeue' }, silent: true });
      await ctx.emit({
        type: 'dequeue',
        target: 'queue:front',
        payload: {
          stamp: front.stamp,
          label: front.value,
          value: front.value,
          size: queueState.length,
          time,
        },
      });
      ctx.metric('dequeue-count', 'inc');
    } else if (step.op === 'peek') {
      if (queueState.length === 0) {
        await ctx.emit({
          type: 'phase',
          payload: { phase: 'underflow-check' },
          silent: true,
        });
        await ctx.emit({
          type: 'underflow',
          target: 'queue:front',
          payload: { time },
        });
        ctx.metric('underflow-count', 'inc');
        continue;
      }
      const front = queueState[0];
      await ctx.emit({ type: 'phase', payload: { phase: 'peek' }, silent: true });
      await ctx.emit({
        type: 'peek',
        target: 'queue:front',
        payload: {
          stamp: front.stamp,
          label: front.value,
          value: front.value,
          time,
        },
      });
      ctx.metric('peek-count', 'inc');
    }
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'phase', payload: { phase: 'done' }, silent: true });
  await ctx.emit({ type: 'done' });
}

/**
 * 알고리즘 실행과 별개로 "시나리오 완료 후 큐 최종 상태" 를 즉시 계산.
 * 테스트와 (향후) 요약 패널이 참조.
 */
export function computeQueueResult(initialData: QueueFacetData): {
  type: 'queue-result';
  finalValues: string[];
  overflowCount: number;
  underflowCount: number;
  totalEnqueued: number;
  totalDequeued: number;
} {
  const { initialValues, capacity, scenario } = initialData;
  const isBounded = capacity !== null && Number.isFinite(capacity);
  const q: string[] = [...initialValues];
  let totalEnqueued = initialValues.length;
  let totalDequeued = 0;
  let overflowCount = 0;
  let underflowCount = 0;
  for (const step of scenario) {
    if (step.op === 'enqueue') {
      if (isBounded && q.length >= (capacity as number)) {
        overflowCount++;
        continue;
      }
      q.push(step.value);
      totalEnqueued++;
    } else if (step.op === 'dequeue') {
      if (q.length === 0) {
        underflowCount++;
        continue;
      }
      q.shift();
      totalDequeued++;
    } else if (step.op === 'peek') {
      if (q.length === 0) {
        underflowCount++;
        continue;
      }
    }
  }
  return {
    type: 'queue-result',
    finalValues: q,
    overflowCount,
    underflowCount,
    totalEnqueued,
    totalDequeued,
  };
}
