import type { ProjectorFactory } from '@facet/core/runtime';
import type { BarItemState } from '@facet/core/runtime';

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

export const coinchangeProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as BarChart | undefined;
  const remainingView = views.remainingDisplay as unknown as TextDisplay | undefined;
  const totalView = views.totalDisplay as unknown as TextDisplay | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  let coins: number[] = [];

  return {
    onInit(initialData) {
      const data = initialData as { coins?: number[]; amount?: number } | undefined;
      coins = data?.coins ? [...data.coins].sort((a, b) => b - a) : [];
      if (stage) stage.setData(coins);
      if (remainingView && typeof data?.amount === 'number') {
        remainingView.setText(`Remaining: ${data.amount}`);
      }
      totalView?.setText('Used: 0');
    },
    onEvent(event) {
      switch (event.type) {
        case 'highlight': {
          if (!stage) break;
          for (const i of toIndex(event.target)) stage.setItemState(i, 'comparing');
          break;
        }
        case 'unhighlight': {
          if (!stage) break;
          for (const i of toIndex(event.target)) stage.clearItemState(i);
          break;
        }
        case 'state-changed': {
          const payload = event.payload as
            | { kind?: string; remaining?: number; total?: number; value?: number }
            | undefined;
          if (payload?.kind === 'used') {
            if (remainingView && typeof payload.remaining === 'number') {
              remainingView.setText(`Remaining: ${payload.remaining}`);
            }
            if (totalView && typeof payload.total === 'number') {
              totalView.setText(`Used: ${payload.total}`);
            }
          } else if (payload?.kind === 'remaining' && typeof payload.value === 'number') {
            remainingView?.setText(`Remaining: ${payload.value}`);
          }
          break;
        }
        case 'mark': {
          const payload = event.payload as { kind?: string } | undefined;
          if (payload?.kind === 'used') {
            const ids = toIndex(event.target);
            if (stage) for (const i of ids) stage.setItemState(i, 'sorted');
          } else if (payload?.kind === 'done') {
            const p = payload as { total?: number; remaining?: number };
            if (totalView && typeof p.total === 'number') {
              const note = p.remaining && p.remaining > 0 ? ` (남음: ${p.remaining})` : '';
              totalView.setText(`Total: ${p.total} 개${note}`);
            }
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
      remainingView?.reset();
      totalView?.reset();
    },
  };
};
