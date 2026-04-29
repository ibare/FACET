/**
 * Stack (LIFO) 자료구조 시각화 알고리즘 — 입력 반응형.
 *
 * mount 직후 자동 시연 (initialValues 를 입력 트랙에 채우고 차례로 push) 후
 * 무한 waitForInput 루프로 사용자 입력 (push/pop/peek) 을 수신·반영한다.
 *
 * 식별자 (C1):
 *   - `stack:top` — 더미의 꼭대기. 모든 변화가 일어나는 단 하나의 자리.
 *
 * 이벤트 (C2):
 *   facet 로컬 (StandardEventType 미포함 — 두 번째 사용처 생기면 승격):
 *     - feed-input  target: stack:top  payload: { items: { stamp, label }[] }
 *     - push        target: stack:top  payload: { stamp, label, value, size, fromInput }
 *     - pop         target: stack:top  payload: { stamp, label, value, size }
 *     - peek        target: stack:top  payload: { stamp, label, value }
 *     - overflow    target: stack:top  payload: { attempted, capacity }
 *     - underflow   target: stack:top  payload: { op: 'pop' | 'peek' }
 *     - demo-end    payload: {}                 (자동 시연 종료 신호)
 *
 *   메타 (silent):
 *     - phase  payload: { phase: 'auto-demo' | 'idle' | 'push' | 'pop' | 'peek' }
 *
 * 메트릭 (C5):
 *   - 'push-count'
 *   - 'pop-count'
 *   - 'peek-count'
 *   - 'overflow-count'
 *   - 'underflow-count'
 *
 * 진행 동력은 ReactiveMechanism. registerAlgorithm 시 mechanismKind: 'reactive' 지정.
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type StackInputEvent =
  | { type: 'push'; payload?: { value?: string } & Record<string, unknown> }
  | { type: 'pop' }
  | { type: 'peek' }
  | { type: 'input'; payload?: { name: string; value: string } };

export type StackFacetData = {
  type: 'stack';
  /** 자동 시연으로 미리 push 될 값 (좌→우 = 첫번째 push → 마지막 push). */
  initialValues: string[];
  /** 더미 최대 높이 — 도달 시 overflow. */
  maxHeight: number;
  /** 자동 시연 사이 간격 ms (speedMul 자동 적용은 mechanism.sleep 이 처리). */
  autoDemoIntervalMs: number;
};

type StackEntry = { stamp: number; label: string };

export async function stack(ctxBase: FacetContext<StackFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<StackFacetData>;
  const { initialValues, maxHeight, autoDemoIntervalMs } = ctx.data;

  const state: StackEntry[] = [];
  let nextStamp = 0;
  // 사용자 입력 박스에서 받아온 마지막 값. value-input 이 없거나 비어 있을 때
  // fallback 으로 자동 번호 할당.
  let lastInputValue = '';

  // 0. 자동 시연 — 입력 트랙에 박스 미리 채우고 차례로 push.
  if (initialValues.length > 0) {
    await ctx.emit({ type: 'phase', payload: { phase: 'auto-demo' }, silent: true });
    const items: StackEntry[] = [];
    for (const label of initialValues) {
      nextStamp += 1;
      items.push({ stamp: nextStamp, label });
    }
    await ctx.emit({
      type: 'feed-input',
      target: 'stack:top',
      payload: { items },
    });

    for (const it of items) {
      if (ctx.cancelled) return;
      const ok = await ctx.sleep(autoDemoIntervalMs);
      if (!ok || ctx.cancelled) return;
      state.push(it);
      await ctx.emit({
        type: 'push',
        target: 'stack:top',
        payload: {
          stamp: it.stamp,
          label: it.label,
          value: it.label,
          size: state.length,
          fromInput: true,
        },
      });
      ctx.metric('push-count', 'inc');
    }

    if (ctx.cancelled) return;
    await ctx.emit({ type: 'demo-end' });
  }

  // 1. 입력 반응 루프.
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
  for (;;) {
    if (ctx.cancelled) return;
    let ev: StackInputEvent;
    try {
      ev = await ctx.waitForInput<StackInputEvent>();
    } catch {
      return; // cancelled
    }

    if (ev.type === 'input') {
      // value-input 변경 — 상태만 업데이트, 시각 사건 없음.
      const v = ev.payload?.value;
      if (typeof v === 'string') lastInputValue = v;
      continue;
    }

    if (ev.type === 'push') {
      // payload 우선. 비어 있으면 lastInputValue, 그것도 비면 자동 stamp.
      const fromPayload = ev.payload?.value;
      const candidate =
        (typeof fromPayload === 'string' && fromPayload.trim() !== '' ? fromPayload.trim() : null) ??
        (lastInputValue.trim() !== '' ? lastInputValue.trim() : null);
      const value = candidate ?? String(nextStamp + 1);

      if (state.length >= maxHeight) {
        await ctx.emit({
          type: 'overflow',
          target: 'stack:top',
          payload: { attempted: value, capacity: maxHeight },
        });
        ctx.metric('overflow-count', 'inc');
        continue;
      }
      nextStamp += 1;
      const entry: StackEntry = { stamp: nextStamp, label: value };
      state.push(entry);
      await ctx.emit({ type: 'phase', payload: { phase: 'push' }, silent: true });
      await ctx.emit({
        type: 'push',
        target: 'stack:top',
        payload: {
          stamp: entry.stamp,
          label: entry.label,
          value: entry.label,
          size: state.length,
          fromInput: false,
        },
      });
      ctx.metric('push-count', 'inc');
      continue;
    }

    if (ev.type === 'pop') {
      if (state.length === 0) {
        await ctx.emit({
          type: 'underflow',
          target: 'stack:top',
          payload: { op: 'pop' },
        });
        ctx.metric('underflow-count', 'inc');
        continue;
      }
      const top = state.pop();
      if (!top) continue;
      await ctx.emit({ type: 'phase', payload: { phase: 'pop' }, silent: true });
      await ctx.emit({
        type: 'pop',
        target: 'stack:top',
        payload: {
          stamp: top.stamp,
          label: top.label,
          value: top.label,
          size: state.length,
        },
      });
      ctx.metric('pop-count', 'inc');
      continue;
    }

    if (ev.type === 'peek') {
      if (state.length === 0) {
        await ctx.emit({
          type: 'underflow',
          target: 'stack:top',
          payload: { op: 'peek' },
        });
        ctx.metric('underflow-count', 'inc');
        continue;
      }
      const top = state[state.length - 1];
      await ctx.emit({ type: 'phase', payload: { phase: 'peek' }, silent: true });
      await ctx.emit({
        type: 'peek',
        target: 'stack:top',
        payload: {
          stamp: top.stamp,
          label: top.label,
          value: top.label,
        },
      });
      ctx.metric('peek-count', 'inc');
      continue;
    }
  }
}
