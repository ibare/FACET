import type { ProjectorFactory } from '@facet/core/runtime';
import type { BarItemState } from '@facet/core/runtime';

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

export const countingsortProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as BarChart | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  const sortedIndices = new Set<number>();
  let values: number[] = [];

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[] } | undefined;
      values = [...(data?.values ?? [])];
      if (stage) stage.setData(values);
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
            if (sortedIndices.has(i)) stage.setItemState(i, 'sorted');
            else stage.clearItemState(i);
          }
          break;
        }
        case 'state-changed': {
          const payload = event.payload as { kind?: string; at?: number; value?: number } | undefined;
          if (!stage) break;
          if (payload?.kind === 'place' && typeof payload.at === 'number' && typeof payload.value === 'number') {
            values[payload.at] = payload.value;
            stage.setData(values);
            for (const i of sortedIndices) stage.setItemState(i, 'sorted');
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
