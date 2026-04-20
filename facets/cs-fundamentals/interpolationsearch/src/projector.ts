import type { ProjectorFactory } from '@facet/core/runtime';
import type { BarItemState } from '@facet/core/runtime';

type BarChart = {
  setData(values: number[]): void;
  setItemState(i: number, s: BarItemState): void;
  clearItemState(i: number): void;
  swapItems(i: number, j: number): void;
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

export const interpolationsearchProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as BarChart | undefined;
  const targetView = views.targetDisplay as unknown as TextDisplay | undefined;
  const resultView = views.resultDisplay as unknown as TextDisplay | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  let length = 0;

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[]; target?: number } | undefined;
      if (stage && data?.values) {
        stage.setData(data.values);
        length = data.values.length;
      }
      if (targetView && typeof data?.target === 'number') targetView.setText(String(data.target));
      resultView?.reset();
    },
    onEvent(event) {
      switch (event.type) {
        case 'highlight': {
          if (!stage) break;
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          const ids = toIndex(event.target);
          if (kind === 'range') {
            for (let i = 0; i < length; i++) stage.clearItemState(i);
            for (const i of ids) stage.setItemState(i, 'active');
          } else if (kind === 'pos') {
            for (const i of ids) stage.setItemState(i, 'comparing');
          } else {
            for (const i of ids) stage.setItemState(i, 'comparing');
          }
          break;
        }
        case 'unhighlight':
          if (!stage) break;
          for (const i of toIndex(event.target)) stage.clearItemState(i);
          break;
        case 'mark': {
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          const ids = toIndex(event.target);
          if (kind === 'found') {
            if (stage) for (const i of ids) stage.setItemState(i, 'sorted');
            if (resultView && ids.length > 0) resultView.setText(`찾음 @ index ${ids[0]}`);
          } else if (kind === 'discard') {
            if (stage) for (const i of ids) stage.clearItemState(i);
          } else if (kind === 'not-found') {
            resultView?.setText('찾지 못함');
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
    },
  };
};
