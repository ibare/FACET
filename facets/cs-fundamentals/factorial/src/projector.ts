import type { ProjectorFactory } from '@facet/core/runtime';
import type { BarItemState } from '@facet/core/runtime';
import { toIndexArray } from '@facet/core/runtime';

type BarChart = {
  setData(values: number[]): void;
  setItemState(i: number, s: BarItemState): void;
  clearItemState(i: number): void;
  reset(): void;
};
type TextDisplay = {
  setText(t: string): void;
  reset(): void;
};
type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

export const factorialProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as BarChart | undefined;
  const inputView = views.inputDisplay as unknown as TextDisplay | undefined;
  const partialView = views.partialDisplay as unknown as TextDisplay | undefined;
  const resultView = views.resultDisplay as unknown as TextDisplay | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  return {
    onInit(initialData) {
      const data = initialData as { n?: number } | undefined;
      stage?.setData([]);
      if (inputView && typeof data?.n === 'number') inputView.setText(`n = ${data.n}`);
      partialView?.reset();
      resultView?.reset();
    },
    onEvent(event) {
      switch (event.type) {
        case 'state-changed': {
          const payload = event.payload as { kind?: string; stack?: number[] } | undefined;
          if (payload?.stack && stage) stage.setData(payload.stack);
          break;
        }
        case 'highlight': {
          if (!stage) break;
          for (const i of toIndexArray(event.target)) {
            stage.setItemState(i, 'comparing');
          }
          break;
        }
        case 'mark': {
          const payload = event.payload as { kind?: string; value?: number } | undefined;
          if (payload?.kind === 'partial' && partialView && typeof payload.value === 'number') {
            partialView.setText(String(payload.value));
          } else if (payload?.kind === 'result' && resultView && typeof payload.value === 'number') {
            resultView.setText(`${payload.value}`);
          }
          break;
        }
        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase ?? null;
          codePanel?.highlightPhase(phase);
          break;
        }
        case 'done':
          codePanel?.clearHighlight();
          break;
      }
    },
    onReset() {
      codePanel?.clearHighlight();
      partialView?.reset();
      resultView?.reset();
      stage?.setData([]);
    },
  };
};
