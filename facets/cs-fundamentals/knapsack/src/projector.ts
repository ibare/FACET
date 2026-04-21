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

export const knapsackProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as BarChart | undefined;
  const capView = views.capacityDisplay as unknown as TextDisplay | undefined;
  const bestView = views.bestDisplay as unknown as TextDisplay | undefined;
  const resultView = views.resultDisplay as unknown as TextDisplay | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  return {
    onInit(initialData) {
      const data = initialData as
        | { values?: number[]; weights?: number[]; capacity?: number }
        | undefined;
      if (stage && data?.values && data?.weights) {
        // 비율 내림차순 정렬된 순서로 시각화 (알고리즘과 일치)
        const n = data.values.length;
        const order: number[] = [];
        for (let i = 0; i < n; i++) order.push(i);
        order.sort(
          (a, b) => data.values![b] / data.weights![b] - data.values![a] / data.weights![a],
        );
        stage.setData(order.map((i) => data.values![i]));
      }
      if (capView && typeof data?.capacity === 'number') {
        capView.setText(`Capacity: ${data.capacity}`);
      }
      bestView?.setText('Best: 0');
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
          if (!stage) break;
          const payload = event.payload as { kind?: string } | undefined;
          for (const i of toIndexArray(event.target)) {
            if (payload?.kind === 'include') stage.setItemState(i, 'pivot');
            else if (payload?.kind === 'exclude') stage.clearItemState(i);
          }
          break;
        }
        case 'mark': {
          const payload = event.payload as
            | { kind?: string; value?: number; picks?: number[] }
            | undefined;
          if (payload?.kind === 'best') {
            if (bestView && typeof payload.value === 'number') {
              bestView.setText(`Best: ${payload.value}`);
            }
          } else if (payload?.kind === 'final') {
            const ids = payload.picks ?? [];
            if (resultView) resultView.setText(`최적 값: ${payload.value}, 선택: [${ids.join(', ')}]`);
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
      bestView?.setText('Best: 0');
      resultView?.reset();
    },
  };
};
