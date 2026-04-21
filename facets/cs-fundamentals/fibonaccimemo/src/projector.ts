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

const UNCOMPUTED = -1;

export const fibonaccimemoProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as BarChart | undefined;
  const inputView = views.inputDisplay as unknown as TextDisplay | undefined;
  const resultView = views.resultDisplay as unknown as TextDisplay | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  let table: number[] = [];

  function visibleTable(): number[] {
    return table.map((v) => (v === UNCOMPUTED ? 0 : v));
  }

  return {
    onInit(initialData) {
      const data = initialData as { n?: number } | undefined;
      if (typeof data?.n === 'number') {
        table = new Array(data.n + 1).fill(UNCOMPUTED);
        if (inputView) inputView.setText(`fib(${data.n})`);
        if (stage) stage.setData(visibleTable());
      }
      resultView?.reset();
    },
    onEvent(event) {
      switch (event.type) {
        case 'state-changed': {
          const payload = event.payload as { kind?: string; table?: number[] } | undefined;
          if (payload?.kind === 'memo' && payload.table) {
            table = payload.table;
            if (stage) stage.setData(visibleTable());
            if (stage) {
              for (let i = 0; i < table.length; i++) {
                if (table[i] !== UNCOMPUTED) stage.setItemState(i, 'sorted');
              }
            }
          }
          break;
        }
        case 'highlight': {
          if (!stage) break;
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          const ids = toIndexArray(event.target);
          const state: BarItemState = kind === 'hit' ? 'pivot' : 'comparing';
          for (const i of ids) stage.setItemState(i, state);
          break;
        }
        case 'mark': {
          const payload = event.payload as { kind?: string; value?: number } | undefined;
          if (payload?.kind === 'result' && resultView && typeof payload.value === 'number') {
            resultView.setText(String(payload.value));
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
      resultView?.reset();
      table = table.map(() => UNCOMPUTED);
      if (stage) stage.setData(visibleTable());
    },
  };
};
