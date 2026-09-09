/**
 * 힙 정렬 Projector — 알고리즘 이벤트를 stage(heap-sort-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은 `facet.ts` 의
 * `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type HeapSortStage = {
  setData(values: number[]): void;
  setCaption(text: string): void;
  setHeapSize(size: number): void;
  setFocus(index: number | null): void;
  setEdges(parent: number | null, bigger: number | null): void;
  setCellState(index: number, state: 'comparing' | 'swapping' | null): void;
  clearCellStates(): void;
  swapValues(i: number, j: number): void;
  markSettled(index: number): void;
  setExtractArc(from: number | null, to: number | null): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export const heapSortProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as HeapSortStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  const tr: Translate = runtime?.t ?? makeTranslator();

  // 배열 그림자를 두지 않는다. 문안에 필요한 값은 알고리즘이 payload 로 실어
  // 보내고(`aValue` · `bValue` · `value`), 칸의 값은 stage 가 스스로 들고 있다.

  /** 견줌·맞바꿈 표시를 다음 걸음이 갈아 끼운다 — `unhighlight` 를 쓰지 않는다. */
  const clearMarks = (): void => {
    stage?.clearCellStates();
    stage?.setEdges(null, null);
  };

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[] } | undefined;
      const values = Array.isArray(data?.values) ? [...data.values] : [];
      stage?.setData(values);
      stage?.setHeapSize(values.length);
      stage?.setCaption(
        tr(
          'caption.start',
          'One row is already a tree — the children of seat i are 2i+1 and 2i+2.',
        ),
      );
    },

    onEvent(event) {
      switch (event.type) {
        case 'build-begin': {
          const index = num((event.payload as { firstParent?: number } | undefined)?.firstParent);
          if (index === undefined) break;
          stage?.setCaption(
            tr('caption.buildBegin', 'Start at seat {index}, the last seat that has children.', {
              index,
            }),
          );
          break;
        }

        case 'sift-begin': {
          const p = event.payload as { index?: number; origin?: string } | undefined;
          const index = num(p?.index);
          clearMarks();
          stage?.setExtractArc(null, null);
          if (index === undefined) break;
          stage?.setFocus(index);
          stage?.setCaption(
            p?.origin === 'extract'
              ? tr('caption.siftRoot', 'Sink the new top back down through the smaller heap.')
              : tr('caption.siftBuild', 'Sink the value at seat {index} as far as it must go.', {
                  index,
                }),
          );
          break;
        }

        case 'highlight': {
          const p = event.payload as
            | {
                kind?: string;
                parent?: number;
                left?: number;
                right?: number;
                child?: number;
                leftValue?: number;
                rightValue?: number;
                parentValue?: number;
                childValue?: number;
                bigger?: number;
              }
            | undefined;
          stage?.clearCellStates();
          if (p?.kind === 'children') {
            const parent = num(p.parent);
            const leftIdx = num(p.left);
            const rightIdx = num(p.right);
            const bigger = num(p.bigger);
            const leftValue = num(p.leftValue);
            const rightValue = num(p.rightValue);
            if (leftIdx !== undefined) stage?.setCellState(leftIdx, 'comparing');
            if (rightIdx !== undefined) stage?.setCellState(rightIdx, 'comparing');
            stage?.setEdges(parent ?? null, bigger ?? null);
            // 어느 쪽이 큰지는 알고리즘이 정한다 — projector 가 다시 견주지 않는다.
            const biggerValue = bigger === rightIdx ? rightValue : leftValue;
            if (leftValue !== undefined && rightValue !== undefined && biggerValue !== undefined) {
              stage?.setCaption(
                tr('caption.compareChildren', 'Two children {left} and {right} — {big} is bigger.', {
                  left: leftValue,
                  right: rightValue,
                  big: biggerValue,
                }),
              );
            }
          } else if (p?.kind === 'parent-child') {
            const parent = num(p.parent);
            const child = num(p.child);
            const parentValue = num(p.parentValue);
            const childValue = num(p.childValue);
            if (parent !== undefined) stage?.setCellState(parent, 'comparing');
            if (child !== undefined) stage?.setCellState(child, 'comparing');
            stage?.setEdges(parent ?? null, child ?? null);
            if (parentValue !== undefined && childValue !== undefined) {
              stage?.setCaption(
                tr('caption.compareParent', 'Is the parent {parent} already at least {child}?', {
                  parent: parentValue,
                  child: childValue,
                }),
              );
            }
          }
          break;
        }

        case 'state-changed': {
          const p = event.payload as
            | { kind?: string; i?: number; j?: number; aValue?: number; bValue?: number }
            | undefined;
          const i = num(p?.i);
          const j = num(p?.j);
          const aValue = num(p?.aValue);
          const bValue = num(p?.bValue);
          if (i === undefined || j === undefined) break;

          if (p?.kind === 'swap-top-end') {
            clearMarks();
            stage?.setFocus(null);
            stage?.setExtractArc(i, j);
          }
          stage?.setCellState(i, 'swapping');
          stage?.setCellState(j, 'swapping');
          stage?.swapValues(i, j);

          if (p?.kind === 'move-down') {
            stage?.setFocus(j);
            if (aValue !== undefined && bValue !== undefined) {
              stage?.setCaption(
                tr('caption.moveDown', '{parent} is the smaller one — it sinks past {child}.', {
                  parent: aValue,
                  child: bValue,
                }),
              );
            }
          } else if (aValue !== undefined && bValue !== undefined) {
            stage?.setCaption(
              tr('caption.swapTopEnd', 'Swap the top {top} with the last cell {tail} of the heap.', {
                top: aValue,
                tail: bValue,
              }),
            );
          }
          break;
        }

        case 'sift-end': {
          const value = num((event.payload as { value?: number } | undefined)?.value);
          clearMarks();
          stage?.setFocus(null);
          if (value !== undefined) {
            stage?.setCaption(
              tr('caption.settleDown', '{value} has nowhere lower to go — it rests here.', {
                value,
              }),
            );
          }
          break;
        }

        case 'mark': {
          const p = event.payload as { kind?: string; index?: number; value?: number } | undefined;
          if (p?.kind !== 'sorted') break;
          const index = num(p.index);
          const value = num(p.value);
          if (index === undefined) break;
          stage?.markSettled(index);
          if (value !== undefined) {
            stage?.setCaption(
              tr('caption.settleSeat', '{value} takes seat {index} and never moves again.', {
                value,
                index,
              }),
            );
          }
          break;
        }

        case 'heap-shrink': {
          const size = num((event.payload as { size?: number } | undefined)?.size);
          if (size === undefined) break;
          stage?.setHeapSize(size);
          stage?.setCaption(
            tr('caption.shrinkHeap', 'The heap shrinks to {size} cells — that seat left the tree.', {
              size,
            }),
          );
          break;
        }

        case 'build-end': {
          const top = num((event.payload as { top?: number } | undefined)?.top);
          clearMarks();
          stage?.setFocus(null);
          if (top !== undefined) {
            stage?.setCaption(
              tr('caption.buildEnd', 'It is a max heap now — the top {top} is the largest value.', {
                top,
              }),
            );
          }
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase ?? null;
          codePanel?.highlightPhase(phase);
          break;
        }

        case 'done': {
          const p = event.payload as { compares?: number; swaps?: number } | undefined;
          const compares = num(p?.compares);
          const swaps = num(p?.swaps);
          codePanel?.clearHighlight();
          clearMarks();
          stage?.setFocus(null);
          stage?.setExtractArc(null, null);
          if (compares !== undefined && swaps !== undefined) {
            stage?.setCaption(
              tr('caption.done', 'Sorted with {compares} compares and {swaps} swaps.', {
                compares,
                swaps,
              }),
            );
          }
          break;
        }

        // 그 외 이벤트는 없다. 알고리즘이 발신하는 전부를 위에서 다룬다 (C2).
      }
    },

    onReset() {
      // stage 의 값 복원은 러너가 reset 뒤 onInit 을 다시 불러 setData 로 한다.
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
