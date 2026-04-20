/**
 * QuickSort Projector — 알고리즘 이벤트를 bar-chart + code-view 메서드로 번역.
 *
 * 책임:
 *   - bar-chart 의 색상/swap 갱신
 *   - code-view 의 phase 동기 하이라이트
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import type { BarItemState } from '@facet/core/runtime';

type BarChart = {
  setData(values: number[]): void;
  setItemState(i: number, s: BarItemState): void;
  clearItemState(i: number): void;
  clearAllStates(): void;
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
    if (typeof t !== 'string') continue;
    const m = /^index:(\d+)$/.exec(t);
    if (m) out.push(Number(m[1]));
  }
  return out;
}

export const quicksortProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as BarChart | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // 정렬 완료 표시는 누적 — reset 시 비움
  const sortedIndices = new Set<number>();

  function applySorted() {
    if (!stage) return;
    for (const i of sortedIndices) stage.setItemState(i, 'sorted');
  }

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[] } | undefined;
      if (stage && data?.values) stage.setData(data.values);
      sortedIndices.clear();
    },
    onEvent(event) {
      switch (event.type) {
        case 'highlight': {
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          const indices = toIndex(event.target);
          if (!stage) break;
          const state: BarItemState =
            kind === 'pivot' ? 'pivot' : kind === 'compare' ? 'comparing' : 'active';
          for (const i of indices) {
            if (!sortedIndices.has(i)) stage.setItemState(i, state);
          }
          break;
        }
        case 'unhighlight': {
          const indices = toIndex(event.target);
          if (!stage) break;
          for (const i of indices) {
            if (!sortedIndices.has(i)) stage.clearItemState(i);
          }
          break;
        }
        case 'state-changed': {
          const payload = event.payload as { kind?: string; i?: number; j?: number } | undefined;
          if (!stage) break;
          if (payload?.kind === 'swap' && typeof payload.i === 'number' && typeof payload.j === 'number') {
            stage.swapItems(payload.i, payload.j);
            // 두 인덱스에 swap 색상 강조
            if (!sortedIndices.has(payload.i)) stage.setItemState(payload.i, 'swapping');
            if (!sortedIndices.has(payload.j)) stage.setItemState(payload.j, 'swapping');
          }
          break;
        }
        case 'mark': {
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          const indices = toIndex(event.target);
          if (!stage) break;
          if (kind === 'sorted') {
            for (const i of indices) {
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
          if (stage) {
            // 모든 인덱스 정렬 표시
            for (let i = 0; i < 99; i++) sortedIndices.add(i);
            // setData 후 sortedIndices 의 유효 인덱스만 적용됨
            applySorted();
          }
          codePanel?.clearHighlight();
          break;
        }
      }
    },
    onReset() {
      sortedIndices.clear();
      codePanel?.clearHighlight();
      // stage 의 데이터 자체는 runner 가 reset 시 onInit 에서 다시 세팅
    },
  };
};
