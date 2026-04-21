import type { ProjectorFactory } from '@facet/core/runtime';
import type { BarItemState } from '@facet/core/runtime';
import { toIndexArray } from '@facet/core/runtime';

type BarChart = {
  setData(values: number[]): void;
  setItemState(i: number, s: BarItemState): void;
  clearItemState(i: number): void;
  swapItems(i: number, j: number): void;
  reset(): void;
};
type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

export const heapsortProjector: ProjectorFactory = (views) => {
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
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          for (const i of toIndexArray(event.target)) {
            if (sortedIndices.has(i)) continue;
            if (kind === 'root') stage.setItemState(i, 'pivot');
            else stage.setItemState(i, 'comparing');
          }
          break;
        }
        case 'unhighlight': {
          if (!stage) break;
          for (const i of toIndexArray(event.target)) {
            if (sortedIndices.has(i)) stage.setItemState(i, 'sorted');
            else stage.clearItemState(i);
          }
          break;
        }
        case 'state-changed': {
          const payload = event.payload as { kind?: string; i?: number; j?: number } | undefined;
          if (!stage) break;
          if (payload?.kind === 'swap' && typeof payload.i === 'number' && typeof payload.j === 'number') {
            stage.swapItems(payload.i, payload.j);
          }
          break;
        }
        case 'mark': {
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          if (!stage) break;
          if (kind === 'sorted') {
            for (const i of toIndexArray(event.target)) {
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
