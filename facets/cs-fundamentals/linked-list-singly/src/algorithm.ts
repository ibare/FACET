/**
 * 단일 연결 리스트 (Linked List) 자료구조 시각화 알고리즘 — 입력 반응형.
 *
 * mount 직후 `initialData.autoDemoSequence` 를 순서대로 재생한 뒤, 무한 waitForInput
 * 루프로 사용자 입력 (insert/remove/search) 을 1:1 시각 사건으로 매핑한다.
 * 시퀀스가 비어 있으면 자동 시연 없이 초기 배치 그대로 머문다 — 한 대목만 확대한
 * aspect facet 이 정지 화면을 얻는 경로다.
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

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LinkedListInputEvent =
  | { type: 'input'; payload?: { name: string; value: string } }
  | { type: 'insert'; payload?: { index?: string; value?: string } }
  | { type: 'remove'; payload?: { index?: string; value?: string } }
  | { type: 'search'; payload?: { index?: string; value?: string } };

/** 자동 시연 한 걸음. 사용자 입력과 같은 실행 경로를 탄다. */
export type LinkedListAutoDemoStep =
  | { op: 'insert'; index: number; value: string }
  | { op: 'remove'; index: number }
  | { op: 'search'; value: string };

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
  /**
   * mount 직후 재생할 자동 시연. 빈 배열이면 초기 배치 그대로 정지한다.
   *
   * 무엇을 시연할지는 저작 결정이므로 알고리즘이 아니라 선언에 둔다 (원칙 2).
   * 같은 algorithm 을 공유하면서 시연만 달리한 aspect facet 이 이 필드로 갈린다.
   */
  autoDemoSequence?: LinkedListAutoDemoStep[];
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
  const {
    initialValues,
    autoDemoIntervalMs,
    searchStepMs,
    maxSize,
    autoDemoSequence,
  } = ctx.data;

  // 모델 상태.
  const values: string[] = [...initialValues];

  // 사용자 입력 박스 마지막 값.
  let lastIndex = '';
  let lastValue = '';

  // 실행부 — 자동 시연과 입력 루프가 같은 경로를 공유한다. 둘이 갈라지면
  // 시연이 보여 준 것과 학습자가 눌러 본 것이 달라진다.
  async function applyInsert(index: number, value: string): Promise<void> {
    values.splice(index, 0, value);
    await ctx.emit({ type: 'phase', payload: { phase: 'insert' }, silent: true });
    await ctx.emit({
      type: 'insert',
      target: `index:${index}`,
      payload: { index, value, isHead: index === 0 },
    });
    ctx.metric('insert-count', 'inc');
  }

  async function applyRemove(index: number): Promise<void> {
    const value = values[index]!;
    values.splice(index, 1);
    await ctx.emit({ type: 'phase', payload: { phase: 'remove' }, silent: true });
    await ctx.emit({
      type: 'remove',
      target: `index:${index}`,
      payload: { index, value, isHead: index === 0 },
    });
    ctx.metric('remove-count', 'inc');
  }

  /** head 부터 한 칸씩 훑는다. 취소되면 false — 호출부가 즉시 빠져나가야 한다 (C8). */
  async function applySearch(needle: string): Promise<boolean> {
    ctx.metric('search-count', 'inc');
    await ctx.emit({ type: 'phase', payload: { phase: 'search' }, silent: true });
    await ctx.emit({ type: 'search-prepare', payload: { value: needle } });

    let matchIdx = -1;
    let walked = 0;
    for (let i = 0; i < values.length; i++) {
      if (ctx.cancelled) return false;
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
      if (!ok || ctx.cancelled) return false;
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
    return true;
  }

  // 0. 초기 상태 통보.
  await ctx.emit({
    type: 'init',
    payload: { values: [...values] },
  });

  // 1. 자동 시연 — 무엇을 보여 줄지는 facet 선언이 정한다.
  await ctx.emit({ type: 'phase', payload: { phase: 'auto-demo' }, silent: true });
  for (const step of autoDemoSequence ?? []) {
    if (ctx.cancelled) return;
    const ok = await ctx.sleep(autoDemoIntervalMs);
    if (!ok || ctx.cancelled) return;
    if (step.op === 'insert') {
      if (values.length >= maxSize) continue;
      await applyInsert(Math.min(step.index, values.length), step.value);
    } else if (step.op === 'remove') {
      if (values.length === 0) continue;
      await applyRemove(Math.min(step.index, values.length - 1));
    } else {
      if (values.length === 0) continue;
      if (!(await applySearch(step.value))) return;
    }
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
      await applyInsert(idx, insertVal);
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
      await applyRemove(idx);
      continue;
    }

    if (ev.type === 'search') {
      if (values.length === 0) {
        await ctx.emit({ type: 'empty-list', payload: { op: 'search' } });
        continue;
      }
      const needle = valRaw.trim() !== '' ? valRaw.trim() : '';
      if (needle === '') continue;
      if (!(await applySearch(needle))) return;
      continue;
    }
  }
}
