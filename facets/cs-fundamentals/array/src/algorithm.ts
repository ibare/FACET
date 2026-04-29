/**
 * 배열 (Array) 자료구조 시각화 알고리즘 — 입력 반응형.
 *
 * mount 직후 자동 시연 (read(3) → insert(1, "5")) 후 무한 waitForInput 루프로
 * 사용자 입력 (read/write/insert/remove/append/search) 을 1:1 시각 사건으로 매핑.
 *
 * 식별자 (C1):
 *   - `index:<n>` — 배열 자리 번호. 표준 prefix `index:` 를 사용한다.
 *
 * 이벤트 (C2):
 *   facet 로컬 (StandardEventType 미포함):
 *     - init           target: -            payload: { values, capacity }
 *     - read           target: index:<i>    payload: { index, value }
 *     - write          target: index:<i>    payload: { index, oldValue, newValue }
 *     - insert         target: index:<i>    payload: { index, value, shifted, size, capacity }
 *     - remove         target: index:<i>    payload: { index, value, shifted, size }
 *     - append         target: index:<i>    payload: { index, value, size, capacity }
 *     - search-step    target: index:<i>    payload: { index, value, isMatch, isFinal }
 *     - search-result  payload: { found: boolean, index?: number, value: string }
 *     - resize         payload: { oldCapacity, newCapacity, copied, values }
 *     - out-of-range   payload: { index, op, size }
 *     - limit-reached  payload: { op: 'append' | 'insert', size, maxSize }
 *     - demo-end       payload: {}
 *
 *   메타 (silent):
 *     - phase  payload: { phase: 'auto-demo' | 'idle' | 'read' | 'write' |
 *                                'insert' | 'remove' | 'append' | 'search' | 'resize' }
 *
 * 메트릭 (C5):
 *   - 'read-count'    호명 횟수
 *   - 'write-count'   쓰기 횟수
 *   - 'insert-count'  삽입 횟수
 *   - 'remove-count'  삭제 횟수
 *   - 'append-count'  뒤에 추가 횟수
 *   - 'search-count'  검색 호출 횟수
 *   - 'shift-count'   누적 시프트된 칸 수
 *   - 'resize-count'  resize 발생 횟수
 *
 * 진행 동력은 ReactiveMechanism. registerAlgorithm 시 mechanismKind: 'reactive'.
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type ArrayInputEvent =
  | { type: 'input'; payload?: { name: string; value: string } }
  | { type: 'read'; payload?: { index?: string; value?: string } }
  | { type: 'write'; payload?: { index?: string; value?: string } }
  | { type: 'insert'; payload?: { index?: string; value?: string } }
  | { type: 'remove'; payload?: { index?: string; value?: string } }
  | { type: 'append'; payload?: { index?: string; value?: string } }
  | { type: 'search'; payload?: { index?: string; value?: string } };

export type ArrayFacetData = {
  type: 'array';
  /** 초기 채색 칸 (좌→우). size = initialValues.length. */
  initialValues: string[];
  /** 초기 capacity — 회색 예비 칸 포함 띠 길이. */
  initialCapacity: number;
  /** resize 배율 (capacity 가 가득 차면 곱한 길이로 확장). */
  growthFactor: number;
  /** 자동 시연 사이 간격 ms (speedMul 자동 적용은 mechanism.sleep 이 처리). */
  autoDemoIntervalMs: number;
  /** 검색 시 한 칸당 머무는 간격 ms (운동 길이 비교용). */
  searchStepMs: number;
  /** 학습 한도 — size 가 이 값 이상이면 append / insert 가 거부된다. */
  maxSize: number;
};

function parseIndex(raw: string | undefined, size: number): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n >= size) return null;
  // append 는 별도 검사 (size 까지 허용) — 호출자가 처리.
  return n;
}

function parseInsertIndex(raw: string | undefined, size: number): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > size) return null; // size 자리에 삽입 = append 와 동등
  return n;
}

export async function array(ctxBase: FacetContext<ArrayFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<ArrayFacetData>;
  const {
    initialValues,
    initialCapacity,
    growthFactor,
    autoDemoIntervalMs,
    searchStepMs,
    maxSize,
  } = ctx.data;

  // 모델 상태.
  const values: string[] = [...initialValues];
  let capacity = Math.max(initialCapacity, values.length);

  // 사용자 입력 박스 (i, v) 의 마지막 값.
  let lastIndex = '';
  let lastValue = '';

  // 0. 초기 상태 통보.
  await ctx.emit({
    type: 'init',
    payload: { values: [...values], capacity },
  });

  // 1. 자동 시연 — read(3) → insert(1, "5") (기획 §9 권장 시퀀스).
  await ctx.emit({ type: 'phase', payload: { phase: 'auto-demo' }, silent: true });

  if (values.length > 3) {
    const ok1 = await ctx.sleep(autoDemoIntervalMs);
    if (!ok1 || ctx.cancelled) return;
    await ctx.emit({ type: 'phase', payload: { phase: 'read' }, silent: true });
    await ctx.emit({
      type: 'read',
      target: 'index:3',
      payload: { index: 3, value: values[3] },
    });
    ctx.metric('read-count', 'inc');
  }

  if (values.length > 1) {
    const ok2 = await ctx.sleep(autoDemoIntervalMs);
    if (!ok2 || ctx.cancelled) return;
    // resize 가 필요한지 먼저 검사.
    if (values.length >= capacity) {
      await emitResize(ctx, values, capacity, growthFactor);
      capacity = capacity * growthFactor;
    }
    const insertIdx = 1;
    const insertVal = '5';
    const shifted = values.length - insertIdx;
    values.splice(insertIdx, 0, insertVal);
    await ctx.emit({ type: 'phase', payload: { phase: 'insert' }, silent: true });
    await ctx.emit({
      type: 'insert',
      target: `index:${insertIdx}`,
      payload: {
        index: insertIdx,
        value: insertVal,
        shifted,
        size: values.length,
        capacity,
      },
    });
    ctx.metric('insert-count', 'inc');
    if (shifted > 0) ctx.metric('shift-count', shifted);
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'demo-end' });

  // 2. 입력 반응 루프.
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
  for (;;) {
    if (ctx.cancelled) return;
    let ev: ArrayInputEvent;
    try {
      ev = await ctx.waitForInput<ArrayInputEvent>();
    } catch {
      return; // cancelled
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

    // 입력 박스 우선 → payload 보충 fallback.
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

    if (ev.type === 'read') {
      const idx = parseIndex(idxRaw, values.length);
      if (idx === null) {
        await ctx.emit({
          type: 'out-of-range',
          payload: { index: idxRaw, op: 'read', size: values.length },
        });
        continue;
      }
      await ctx.emit({ type: 'phase', payload: { phase: 'read' }, silent: true });
      await ctx.emit({
        type: 'read',
        target: `index:${idx}`,
        payload: { index: idx, value: values[idx] },
      });
      ctx.metric('read-count', 'inc');
      continue;
    }

    if (ev.type === 'write') {
      const idx = parseIndex(idxRaw, values.length);
      if (idx === null) {
        await ctx.emit({
          type: 'out-of-range',
          payload: { index: idxRaw, op: 'write', size: values.length },
        });
        continue;
      }
      const oldValue = values[idx];
      const newValue = valRaw.trim() !== '' ? valRaw.trim() : oldValue;
      values[idx] = newValue;
      await ctx.emit({ type: 'phase', payload: { phase: 'write' }, silent: true });
      await ctx.emit({
        type: 'write',
        target: `index:${idx}`,
        payload: { index: idx, oldValue, newValue },
      });
      ctx.metric('write-count', 'inc');
      continue;
    }

    if (ev.type === 'insert') {
      const idx = parseInsertIndex(idxRaw, values.length);
      if (idx === null) {
        await ctx.emit({
          type: 'out-of-range',
          payload: { index: idxRaw, op: 'insert', size: values.length },
        });
        continue;
      }
      if (values.length >= maxSize) {
        await ctx.emit({
          type: 'limit-reached',
          payload: { op: 'insert', size: values.length, maxSize },
        });
        continue;
      }
      const insertVal = valRaw.trim() !== '' ? valRaw.trim() : String(values.length + 1);
      // capacity 가 가득 차 있다면 resize 가 먼저.
      if (values.length >= capacity) {
        await emitResize(ctx, values, capacity, growthFactor);
        capacity = capacity * growthFactor;
      }
      const shifted = values.length - idx;
      values.splice(idx, 0, insertVal);
      await ctx.emit({ type: 'phase', payload: { phase: 'insert' }, silent: true });
      await ctx.emit({
        type: 'insert',
        target: `index:${idx}`,
        payload: { index: idx, value: insertVal, shifted, size: values.length, capacity },
      });
      ctx.metric('insert-count', 'inc');
      if (shifted > 0) ctx.metric('shift-count', shifted);
      continue;
    }

    if (ev.type === 'remove') {
      const idx = parseIndex(idxRaw, values.length);
      if (idx === null) {
        await ctx.emit({
          type: 'out-of-range',
          payload: { index: idxRaw, op: 'remove', size: values.length },
        });
        continue;
      }
      const value = values[idx];
      values.splice(idx, 1);
      const shifted = values.length - idx;
      await ctx.emit({ type: 'phase', payload: { phase: 'remove' }, silent: true });
      await ctx.emit({
        type: 'remove',
        target: `index:${idx}`,
        payload: { index: idx, value, shifted, size: values.length },
      });
      ctx.metric('remove-count', 'inc');
      if (shifted > 0) ctx.metric('shift-count', shifted);
      continue;
    }

    if (ev.type === 'append') {
      if (values.length >= maxSize) {
        await ctx.emit({
          type: 'limit-reached',
          payload: { op: 'append', size: values.length, maxSize },
        });
        continue;
      }
      const v = valRaw.trim() !== '' ? valRaw.trim() : String(values.length + 1);
      if (values.length >= capacity) {
        await emitResize(ctx, values, capacity, growthFactor);
        capacity = capacity * growthFactor;
      }
      const idx = values.length;
      values.push(v);
      await ctx.emit({ type: 'phase', payload: { phase: 'append' }, silent: true });
      await ctx.emit({
        type: 'append',
        target: `index:${idx}`,
        payload: { index: idx, value: v, size: values.length, capacity },
      });
      ctx.metric('append-count', 'inc');
      continue;
    }

    if (ev.type === 'search') {
      const needle = valRaw.trim() !== '' ? valRaw.trim() : '';
      if (needle === '') {
        // 검색 값 없음 → 무시 (일반 사용자에게는 캡션으로만 안내될 것).
        continue;
      }
      ctx.metric('search-count', 'inc');
      await ctx.emit({ type: 'phase', payload: { phase: 'search' }, silent: true });
      let matchIdx = -1;
      for (let i = 0; i < values.length; i++) {
        if (ctx.cancelled) return;
        const isMatch = values[i] === needle;
        const isFinal = isMatch || i === values.length - 1;
        await ctx.emit({
          type: 'search-step',
          target: `index:${i}`,
          payload: { index: i, value: values[i], isMatch, isFinal },
        });
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
            ? { found: true, index: matchIdx, value: needle }
            : { found: false, value: needle },
      });
      continue;
    }
  }
}

async function emitResize(
  ctx: ReactiveContext<ArrayFacetData>,
  values: readonly string[],
  oldCapacity: number,
  growthFactor: number,
): Promise<void> {
  const newCapacity = oldCapacity * growthFactor;
  await ctx.emit({ type: 'phase', payload: { phase: 'resize' }, silent: true });
  await ctx.emit({
    type: 'resize',
    payload: {
      oldCapacity,
      newCapacity,
      copied: values.length,
      values: [...values],
    },
  });
  ctx.metric('resize-count', 'inc');
}
