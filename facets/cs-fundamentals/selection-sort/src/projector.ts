/**
 * 선택 정렬 Projector — 알고리즘 이벤트를 stage(selection-sort-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은 `facet.ts` 의
 * `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, toIndexArray } from '@ffacet/core/runtime';

type SelectionSortStage = {
  setData(values: number[]): void;
  setCaption(text: string): void;
  setSeat(index: number | null): void;
  setMinMarker(index: number | null): void;
  setCursor(index: number | null): void;
  flashSwap(i: number, j: number): void;
  clearTransient(): void;
  swapValues(i: number, j: number): void;
  markSettled(index: number): void;
  beginPass(pass: number): void;
  addCompare(pass: number): void;
  endPass(pass: number, compares: number, swapped: boolean): void;
  setTotals(compares: number, moves: number): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export const selectionSortProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SelectionSortStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // en 원본은 호출부 리터럴로 남긴다 — 추출기가 리터럴만 읽는다 (C10).
  const tr: Translate = runtime?.t ?? makeTranslator();

  /** 지금 몇 번째 바퀴인지. 장부의 어느 줄에 견줌을 쌓을지 정한다. */
  let pass = 0;

  return {
    onInit(initialData) {
      const data = initialData as { values?: unknown } | undefined;
      const values = Array.isArray(data?.values)
        ? data.values.filter((x): x is number => typeof x === 'number')
        : [];
      pass = 0;
      stage?.setData(values);
      stage?.setCaption(
        tr('caption.start', 'Nothing is in place yet. Each pass fills one more seat from the left.'),
      );
    },

    onEvent(event) {
      switch (event.type) {
        case 'pass-begin': {
          const p = event.payload as
            | { pass?: number; seat?: number; minValue?: number; remaining?: number }
            | undefined;
          const passNo = num(p?.pass);
          const seat = num(p?.seat);
          const minValue = num(p?.minValue);
          const remaining = num(p?.remaining);
          if (passNo === undefined || seat === undefined) break;
          pass = passNo;
          stage?.clearTransient();
          stage?.setSeat(seat);
          stage?.setMinMarker(seat);
          stage?.beginPass(passNo);
          if (minValue !== undefined && remaining !== undefined) {
            stage?.setCaption(
              tr(
                'caption.pickSeat',
                'Seat {seat} is next. Assume {value} is the smallest and scan the {remaining} cells to its right.',
                { seat, value: minValue, remaining },
              ),
            );
          }
          break;
        }

        case 'highlight': {
          const p = event.payload as { value?: number; minValue?: number } | undefined;
          const value = num(p?.value);
          const minValue = num(p?.minValue);
          for (const i of toIndexArray(event.target)) stage?.setCursor(i);
          stage?.addCompare(pass);
          if (value !== undefined && minValue !== undefined) {
            stage?.setCaption(
              tr('caption.compare', 'Is {value} smaller than {min}?', {
                value,
                min: minValue,
              }),
            );
          }
          break;
        }

        case 'min-moved': {
          const p = event.payload as
            | { index?: number; value?: number; previousValue?: number }
            | undefined;
          const index = num(p?.index);
          const value = num(p?.value);
          const previousValue = num(p?.previousValue);
          if (index !== undefined) stage?.setMinMarker(index);
          if (value !== undefined && previousValue !== undefined) {
            stage?.setCaption(
              tr(
                'caption.moveMin',
                'Yes — {value} beats {previous}. The min mark moves, but nothing is moved yet.',
                { value, previous: previousValue },
              ),
            );
          }
          break;
        }

        case 'scan-end': {
          const p = event.payload as { compares?: number; minValue?: number } | undefined;
          const compares = num(p?.compares);
          const minValue = num(p?.minValue);
          stage?.setCursor(null);
          if (compares !== undefined && minValue !== undefined) {
            stage?.setCaption(
              tr(
                'caption.scanEnd',
                'Scanned to the end with {count} comparisons. The smallest left is {value}.',
                { count: compares, value: minValue },
              ),
            );
          }
          break;
        }

        case 'state-changed': {
          const p = event.payload as
            | { kind?: string; i?: number; j?: number; seatValue?: number; sentBack?: number }
            | undefined;
          const i = num(p?.i);
          const j = num(p?.j);
          const seatValue = num(p?.seatValue);
          const sentBack = num(p?.sentBack);
          if (p?.kind !== 'swap' || i === undefined || j === undefined) break;
          stage?.flashSwap(i, j);
          stage?.swapValues(i, j);
          stage?.setMinMarker(null);
          if (seatValue !== undefined && sentBack !== undefined) {
            stage?.setCaption(
              tr('caption.swap', 'Bring {value} to seat {seat}; {other} takes its old place.', {
                value: seatValue,
                seat: i,
                other: sentBack,
              }),
            );
          }
          break;
        }

        case 'mark': {
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          if (kind !== 'sorted') break;
          for (const i of toIndexArray(event.target)) stage?.markSettled(i);
          break;
        }

        case 'pass-end': {
          const p = event.payload as
            | {
                pass?: number;
                seat?: number;
                compares?: number;
                swapped?: boolean;
                totalCompares?: number;
                totalSwaps?: number;
              }
            | undefined;
          const passNo = num(p?.pass);
          const seat = num(p?.seat);
          const compares = num(p?.compares);
          const totalCompares = num(p?.totalCompares);
          const totalSwaps = num(p?.totalSwaps);
          const swapped = p?.swapped === true;
          if (passNo !== undefined && compares !== undefined) {
            stage?.endPass(passNo, compares, swapped);
          }
          if (totalCompares !== undefined && totalSwaps !== undefined) {
            stage?.setTotals(totalCompares, totalSwaps);
          }
          stage?.clearTransient();
          stage?.setMinMarker(null);
          stage?.setSeat(null);
          if (!swapped && seat !== undefined) {
            stage?.setCaption(
              tr('caption.alreadyHome', 'The mark never left seat {seat} — no move at all.', {
                seat,
              }),
            );
          }
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: unknown } | undefined)?.phase;
          codePanel?.highlightPhase(typeof phase === 'string' ? phase : null);
          break;
        }

        case 'done': {
          const p = event.payload as
            | { passes?: number; compares?: number; swaps?: number }
            | undefined;
          const passes = num(p?.passes);
          const compares = num(p?.compares);
          const swaps = num(p?.swaps);
          codePanel?.clearHighlight();
          stage?.clearTransient();
          stage?.setSeat(null);
          stage?.setMinMarker(null);
          if (compares !== undefined && swaps !== undefined) {
            stage?.setTotals(compares, swaps);
            if (passes !== undefined) {
              stage?.setCaption(
                tr(
                  'caption.done',
                  'Sorted in {passes} passes: {compares} comparisons but only {swaps} moves.',
                  { passes, compares, swaps },
                ),
              );
            }
          }
          break;
        }

        // 그 외 이벤트는 없다. 알고리즘이 발신하는 전부를 위에서 다룬다 (C2).
      }
    },

    onReset() {
      // stage 의 값 복원은 러너가 reset 뒤 onInit 을 다시 불러 setData 로 한다.
      pass = 0;
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
