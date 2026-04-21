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

export const subsetsumProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as BarChart | undefined;
  const targetView = views.targetDisplay as unknown as TextDisplay | undefined;
  const sumView = views.sumDisplay as unknown as TextDisplay | undefined;
  const resultView = views.resultDisplay as unknown as TextDisplay | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[]; target?: number } | undefined;
      if (stage && data?.values) stage.setData(data.values);
      if (targetView && typeof data?.target === 'number') {
        targetView.setText(`Target: ${data.target}`);
      }
      sumView?.setText('Sum: 0');
      resultView?.reset();
    },
    onEvent(event) {
      switch (event.type) {
        case 'highlight': {
          if (!stage) break;
          for (const i of toIndexArray(event.target)) stage.setItemState(i, 'comparing');
          break;
        }
        case 'unhighlight': {
          if (!stage) break;
          for (const i of toIndexArray(event.target)) stage.clearItemState(i);
          break;
        }
        case 'state-changed': {
          const payload = event.payload as { kind?: string; sum?: number } | undefined;
          if (!stage) break;
          for (const i of toIndexArray(event.target)) {
            if (payload?.kind === 'include') stage.setItemState(i, 'pivot');
            else if (payload?.kind === 'exclude') stage.clearItemState(i);
          }
          if (sumView && typeof payload?.sum === 'number') {
            sumView.setText(`Sum: ${payload.sum}`);
          }
          break;
        }
        case 'mark': {
          const payload = event.payload as { kind?: string; sum?: number } | undefined;
          if (payload?.kind === 'found') {
            const ids = toIndexArray(event.target);
            if (stage) for (const i of ids) stage.setItemState(i, 'sorted');
            if (resultView) resultView.setText(`찾음! 인덱스: [${ids.join(', ')}]`);
          } else if (payload?.kind === 'not-found') {
            resultView?.setText('해당하는 부분집합 없음');
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
      sumView?.setText('Sum: 0');
      resultView?.reset();
    },
  };
};
