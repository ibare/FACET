/**
 * 단일 연결 리스트 (Linked List) 자료구조 시각화 알고리즘 — 입력 반응형.
 *
 * mount 직후 자동 시연 (insert(2, "25")) 으로 결정적 순간을 첫 화면에서 보여 준 뒤,
 * 무한 waitForInput 루프로 사용자 입력 (insert/remove/search) 을 1:1 시각 사건으로 매핑.
 *
 * 식별자 (C1):
 *   - `index:<n>` — 리스트 내 노드 위치 (0-based). 표준 prefix `index:` 를 재사용한다.
 *
 * 이벤트 (C2):
 *   facet 로컬 (StandardEventType 미포함):
 *     - init           target: -            payload: { values }
 *     - insert         target: index:<i>    payload: { index, value, isHead }
 *     - remove         target: index:<i>    payload: { index, value, isHead }
 *     - search-prepare payload: { value }
 *     - search-step    target: index:<i>    payload: { index, value, isMatch, isFinal }
 *     - search-result  payload: { found, index?, value, walked }
 *     - out-of-range   payload: { index, op }
 *     - empty-list     payload: { op }
 *     - demo-end       payload: {}
 *
 *   메타 (silent):
 *     - phase  payload: { phase: 'auto-demo' | 'idle' | 'insert' | 'remove' | 'search' }
 *
 * 메트릭 (C5):
 *   - 'insert-count'  삽입 횟수
 *   - 'remove-count'  삭제 횟수
 *   - 'search-count'  검색 호출 횟수
 *   - 'walk-count'    누적 발자국 (search 진행 중 한 칸 = +1)
 *
 * 진행 동력은 ReactiveMechanism. registerAlgorithm 시 mechanismKind: 'reactive'.
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type LinkedListInputEvent =
  | { type: 'input'; payload?: { name: string; value: string } }
  | { type: 'insert'; payload?: { index?: string; value?: string } }
  | { type: 'remove'; payload?: { index?: string; value?: string } }
  | { type: 'search'; payload?: { index?: string; value?: string } };

export type LinkedListFacetData = {
  type: 'linked-list';
  /** 초기 노드 값 (좌→우, head 부터). */
  initialValues: string[];
  /** 자동 시연 사이 간격 ms. */
  autoDemoIntervalMs: number;
  /** 검색 시 한 칸당 머무는 간격 ms. */
  searchStepMs: number;
  /** 학습 한도 — 노드 수가 이 값 이상이면 insert 가 거부된다 (사슬 가독성 보호). */
  maxSize: number;
};

function parseInsertIndex(raw: string | undefined, size: number): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > size) return null; // size 자리에 삽입 = 끝에 추가와 동등
  return n;
}

function parseRemoveIndex(raw: string | undefined, size: number): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n >= size) return null;
  return n;
}

export async function linkedList(ctxBase: FacetContext<LinkedListFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<LinkedListFacetData>;
  const { initialValues, autoDemoIntervalMs, searchStepMs, maxSize } = ctx.data;

  // 모델 상태.
  const values: string[] = [...initialValues];

  // 사용자 입력 박스 마지막 값.
  let lastIndex = '';
  let lastValue = '';

  // 0. 초기 상태 통보.
  await ctx.emit({
    type: 'init',
    payload: { values: [...values] },
  });

  // 1. 자동 시연 — insert(2, "25") (기획 §3 결정적 순간).
  await ctx.emit({ type: 'phase', payload: { phase: 'auto-demo' }, silent: true });
  if (values.length >= 2) {
    const ok = await ctx.sleep(autoDemoIntervalMs);
    if (!ok || ctx.cancelled) return;
    const insertIdx = Math.min(2, values.length);
    const insertVal = '25';
    values.splice(insertIdx, 0, insertVal);
    await ctx.emit({ type: 'phase', payload: { phase: 'insert' }, silent: true });
    await ctx.emit({
      type: 'insert',
      target: `index:${insertIdx}`,
      payload: { index: insertIdx, value: insertVal, isHead: insertIdx === 0 },
    });
    ctx.metric('insert-count', 'inc');
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'demo-end' });

  // 2. 입력 반응 루프.
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
  for (;;) {
    if (ctx.cancelled) return;
    let ev: LinkedListInputEvent;
    try {
      ev = await ctx.waitForInput<LinkedListInputEvent>();
    } catch {
      return;
    }

    if (ev.type === 'input') {
      const name = ev.payload?.name;
      const v = ev.payload?.value;
      if (typeof v === 'string') {
        if (name === 'index') lastIndex = v;
        else if (name === 'value') lastValue = v;
      }
      continue;
    }

    const idxRaw =
      lastIndex.trim() !== ''
        ? lastIndex
        : typeof ev.payload?.index === 'string'
          ? ev.payload.index
          : '';
    const valRaw =
      lastValue.trim() !== ''
        ? lastValue
        : typeof ev.payload?.value === 'string'
          ? ev.payload.value
          : '';

    if (ev.type === 'insert') {
      const idx = parseInsertIndex(idxRaw, values.length);
      if (idx === null) {
        await ctx.emit({
          type: 'out-of-range',
          payload: { index: idxRaw, op: 'insert' },
        });
        continue;
      }
      if (values.length >= maxSize) {
        await ctx.emit({
          type: 'out-of-range',
          payload: { index: idxRaw, op: 'insert-limit' },
        });
        continue;
      }
      const insertVal = valRaw.trim() !== '' ? valRaw.trim() : String(values.length + 1);
      values.splice(idx, 0, insertVal);
      await ctx.emit({ type: 'phase', payload: { phase: 'insert' }, silent: true });
      await ctx.emit({
        type: 'insert',
        target: `index:${idx}`,
        payload: { index: idx, value: insertVal, isHead: idx === 0 },
      });
      ctx.metric('insert-count', 'inc');
      continue;
    }

    if (ev.type === 'remove') {
      if (values.length === 0) {
        await ctx.emit({ type: 'empty-list', payload: { op: 'remove' } });
        continue;
      }
      const idx = parseRemoveIndex(idxRaw, values.length);
      if (idx === null) {
        await ctx.emit({
          type: 'out-of-range',
          payload: { index: idxRaw, op: 'remove' },
        });
        continue;
      }
      const value = values[idx]!;
      values.splice(idx, 1);
      await ctx.emit({ type: 'phase', payload: { phase: 'remove' }, silent: true });
      await ctx.emit({
        type: 'remove',
        target: `index:${idx}`,
        payload: { index: idx, value, isHead: idx === 0 },
      });
      ctx.metric('remove-count', 'inc');
      continue;
    }

    if (ev.type === 'search') {
      if (values.length === 0) {
        await ctx.emit({ type: 'empty-list', payload: { op: 'search' } });
        continue;
      }
      const needle = valRaw.trim() !== '' ? valRaw.trim() : '';
      if (needle === '') continue;
      ctx.metric('search-count', 'inc');
      await ctx.emit({ type: 'phase', payload: { phase: 'search' }, silent: true });
      await ctx.emit({ type: 'search-prepare', payload: { value: needle } });

      let matchIdx = -1;
      let walked = 0;
      for (let i = 0; i < values.length; i++) {
        if (ctx.cancelled) return;
        walked += 1;
        const isMatch = values[i] === needle;
        const isFinal = isMatch || i === values.length - 1;
        await ctx.emit({
          type: 'search-step',
          target: `index:${i}`,
          payload: { index: i, value: values[i], isMatch, isFinal },
        });
        ctx.metric('walk-count', 'inc');
        const ok = await ctx.sleep(searchStepMs);
        if (!ok || ctx.cancelled) return;
        if (isMatch) {
          matchIdx = i;
          break;
        }
      }
      await ctx.emit({
        type: 'search-result',
        payload:
          matchIdx >= 0
            ? { found: true, index: matchIdx, value: needle, walked }
            : { found: false, value: needle, walked },
      });
      continue;
    }
  }
}
