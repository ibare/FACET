/**
 * BubbleSort Projector — 알고리즘 이벤트 → bar-chart + code-view 메서드.
 *
 * QuickSort Projector 와 같은 bar-chart View 를 재사용한다 (View Catalog 의 가치 검증).
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import type { BarItemState, CodeLine } from '@facet/core/runtime';

type BarChart = {
  setData(values: number[]): void;
  setItemState(i: number, s: BarItemState): void;
  clearItemState(i: number): void;
  swapItems(i: number, j: number): void;
  reset(): void;
};
type CodePanel = {
  setSource(lines: CodeLine[]): void;
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

function toIndex(target: string | string[] | undefined): number[] {
  if (!target) return [];
  const arr = Array.isArray(target) ? target : [target];
  const out: number[] = [];
  for (const t of arr) {
    const m = /^index:(\d+)$/.exec(typeof t === 'string' ? t : '');
    if (m) out.push(Number(m[1]));
  }
  return out;
}

export const bubblesortProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as BarChart | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  const sortedIndices = new Set<number>();

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[] } | undefined;
      if (stage && data?.values) stage.setData(data.values);
      sortedIndices.clear();
    },
    onEvent(event) {
      switch (event.type) {
        case 'highlight': {
          if (!stage) break;
          for (const i of toIndex(event.target)) {
            if (!sortedIndices.has(i)) stage.setItemState(i, 'comparing');
          }
          break;
        }
        case 'unhighlight': {
          if (!stage) break;
          for (const i of toIndex(event.target)) {
            if (!sortedIndices.has(i)) stage.clearItemState(i);
          }
          break;
        }
        case 'state-changed': {
          const payload = event.payload as { kind?: string; i?: number; j?: number } | undefined;
          if (!stage) break;
          if (payload?.kind === 'swap' && typeof payload.i === 'number' && typeof payload.j === 'number') {
            stage.swapItems(payload.i, payload.j);
            if (!sortedIndices.has(payload.i)) stage.setItemState(payload.i, 'swapping');
            if (!sortedIndices.has(payload.j)) stage.setItemState(payload.j, 'swapping');
          }
          break;
        }
        case 'mark': {
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          if (!stage) break;
          if (kind === 'sorted') {
            for (const i of toIndex(event.target)) {
              sortedIndices.add(i);
              stage.setItemState(i, 'sorted');
            }
          }
          break;
        }
        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase ?? null;
          codePanel?.highlightPhase(phase);
          break;
        }
        case 'done': {
          codePanel?.clearHighlight();
          break;
        }
      }
    },
    onReset() {
      sortedIndices.clear();
      codePanel?.clearHighlight();
    },
  };
};
