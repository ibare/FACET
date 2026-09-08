/**
 * heap-binary projector — 힙의 걸음을 stage 메서드 호출로 옮긴다.
 *
 * 문안은 여기서 해석해 완성된 문자열만 넘긴다 (C10). algorithm 은 무엇이
 * 일어났는지만 말하고 무엇이라 부를지는 말하지 않는다.
 *
 * 배열의 내용은 `state-changed` 로만 받는다 — 맞바꿈은 자리 둘의 번호만 오므로
 * 그 자리에 지금 무엇이 있는지는 이쪽이 따라 두어야 한다 (원칙 5 의 shadow-copy).
 */

import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type { HeapBinaryStage } from './heap-binary-stage.js';

type ComparePayload = { a: number; b: number; aValue: number; bValue: number; aheadIsA: boolean };
type SwapPayload = { a: number; b: number };
type MarkPayload = { index: number };
type AppendPayload = { value: number; index: number; size: number };
type ExtractPayload = { value: number; size: number };
type SortedOutPayload = { value: number; slot: number };
type OverflowPayload = { attempted: number; capacity: number };
type StatePayload = { values: number[]; sorted: number[] };

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function numArray(v: unknown): number[] | null {
  return Array.isArray(v) && v.every((n) => typeof n === 'number') ? (v as number[]) : null;
}

function readCompare(p: unknown): ComparePayload | null {
  const o = rec(p);
  if (!o) return null;
  if (typeof o.a !== 'number' || typeof o.b !== 'number') return null;
  if (typeof o.aValue !== 'number' || typeof o.bValue !== 'number') return null;
  if (typeof o.aheadIsA !== 'boolean') return null;
  return { a: o.a, b: o.b, aValue: o.aValue, bValue: o.bValue, aheadIsA: o.aheadIsA };
}

function readSwap(p: unknown): SwapPayload | null {
  const o = rec(p);
  if (!o || typeof o.a !== 'number' || typeof o.b !== 'number') return null;
  return { a: o.a, b: o.b };
}

function readMark(p: unknown): MarkPayload | null {
  const o = rec(p);
  if (!o || typeof o.index !== 'number') return null;
  return { index: o.index };
}

function readAppend(p: unknown): AppendPayload | null {
  const o = rec(p);
  if (!o) return null;
  if (typeof o.value !== 'number' || typeof o.index !== 'number' || typeof o.size !== 'number') return null;
  return { value: o.value, index: o.index, size: o.size };
}

function readExtract(p: unknown): ExtractPayload | null {
  const o = rec(p);
  if (!o || typeof o.value !== 'number' || typeof o.size !== 'number') return null;
  return { value: o.value, size: o.size };
}

function readSortedOut(p: unknown): SortedOutPayload | null {
  const o = rec(p);
  if (!o || typeof o.value !== 'number' || typeof o.slot !== 'number') return null;
  return { value: o.value, slot: o.slot };
}

function readOverflow(p: unknown): OverflowPayload | null {
  const o = rec(p);
  if (!o || typeof o.attempted !== 'number' || typeof o.capacity !== 'number') return null;
  return { attempted: o.attempted, capacity: o.capacity };
}

function readState(p: unknown): StatePayload | null {
  const o = rec(p);
  if (!o) return null;
  const values = numArray(o.values);
  const sorted = numArray(o.sorted);
  if (!values || !sorted) return null;
  return { values, sorted };
}

export const heapBinaryProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as HeapBinaryStage;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();

  /** 배열의 그림자. `state-changed` 로 갱신하고 맞바꿈은 여기서 반영한다. */
  let values: number[] = [];
  let sorted: number[] = [];

  const draw = (): void => stage.setValues([...values], [...sorted]);

  return {
    onInit() {
      values = [];
      sorted = [];
      draw();
      codePanel?.clearHighlight();
      stage.caption(t('caption.start', 'Building a heap — each value climbs to its place.'));
    },

    onReset() {
      values = [];
      sorted = [];
      draw();
      codePanel?.clearHighlight();
      stage.caption(t('caption.start', 'Building a heap — each value climbs to its place.'));
    },

    onEvent(event) {
      switch (event.type) {
        // phase 는 silent 다 — 걸음의 경계가 아니라는 뜻이지, 여기 오지 않는다는
        // 뜻이 아니다. mechanism 은 projector 갱신을 마친 뒤에야 silent 를 보고
        // 후처리를 건너뛴다. 코드 패널의 줄은 이 이벤트로만 짚힌다 (C3).
        case 'phase': {
          const p = rec(event.payload);
          const name = p && typeof p.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase(name);
          return;
        }

        case 'state-changed': {
          const s = readState(event.payload);
          if (!s) return;
          values = [...s.values];
          sorted = [...s.sorted];
          draw();
          return;
        }

        case 'append': {
          const p = readAppend(event.payload);
          if (!p) return;
          values = [...values.slice(0, p.index), p.value];
          draw();
          stage.caption(t('caption.append', '{v} sits at the end — now it climbs.', { v: p.value }));
          return;
        }

        case 'compare': {
          const p = readCompare(event.payload);
          if (!p) return;
          const ahead = p.aheadIsA ? p.aValue : p.bValue;
          stage.compare(
            p.a,
            p.b,
            p.aheadIsA,
            t('caption.compare', '{a} vs {b} — {ahead} comes first.', {
              a: p.aValue,
              b: p.bValue,
              ahead,
            }),
          );
          return;
        }

        case 'swap': {
          const p = readSwap(event.payload);
          if (!p) return;
          const va = values[p.a];
          const vb = values[p.b];
          if (va !== undefined && vb !== undefined) {
            values[p.a] = vb;
            values[p.b] = va;
          }
          stage.swap(
            p.a,
            p.b,
            [...values],
            t('caption.swap', 'Slots {a} and {b} trade places.', { a: p.a, b: p.b }),
          );
          return;
        }

        case 'mark': {
          const p = readMark(event.payload);
          if (!p) return;
          stage.settle(p.index, t('caption.settle', 'This is its place.'));
          return;
        }

        case 'extract-top': {
          const p = readExtract(event.payload);
          if (!p) return;
          // 꼭대기가 빠지고 끝 값이 올라온다. 그림자도 같은 일을 한다.
          const last = values.pop();
          if (values.length > 0 && last !== undefined) values[0] = last;
          draw();
          stage.caption(
            t('caption.extract', '{v} leaves the top; the last value takes its seat and sinks.', {
              v: p.value,
            }),
          );
          return;
        }

        case 'sorted-out': {
          const p = readSortedOut(event.payload);
          if (!p) return;
          sorted = [p.value, ...sorted];
          draw();
          stage.caption(
            t('caption.sortedOut', '{v} is settled — the sorted tail grows from the back.', {
              v: p.value,
            }),
          );
          return;
        }

        case 'overflow': {
          const p = readOverflow(event.payload);
          if (!p) return;
          stage.caption(
            t('caption.overflow', 'No room for {v} — the heap holds {cap}.', {
              v: p.attempted,
              cap: p.capacity,
            }),
          );
          return;
        }

        case 'done': {
          codePanel?.clearHighlight();
          stage.caption(t('caption.done', 'Your turn — insert, extract, heapify or sort.'));
          return;
        }

        default:
          // 다루지 않는 어휘는 무시한다.
          return;
      }
    },
  };
};
