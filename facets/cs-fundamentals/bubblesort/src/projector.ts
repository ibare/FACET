/**
 * BubbleSort Projector — 알고리즘 이벤트를 stage(bar-chart) + 보조 뷰들에 매핑.
 *
 * 시각적 정체성:
 *   1. 파도감     — wave-trail (현재 비교 + 잔상)
 *   2. 떠오름     — rising-marker (큰 값의 추적)
 *   3. 정렬된 꼬리 — sorted-boundary (영역 tint + 경계선)
 *   4. 패스 구조   — pass-tracker (현재 패스, 패스별 swap 막대, tail size)
 *   5. 양 끝       — startPreview / goalPreview, snapshot-strip (패스별 누적)
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import type { BarItemState } from '@facet/core/runtime';

type BarChart = {
  setData(values: number[]): void;
  setItemState(i: number, s: BarItemState): void;
  clearItemState(i: number): void;
  swapItems(i: number, j: number): void;
  swapItemsAnimated?(i: number, j: number, duration?: number): Promise<void>;
  setWaveTrail?(currentIdx: number, trail: number[]): void;
  clearWaveTrail?(): void;
  setRisingMarker?(index: number): void;
  clearRisingMarker?(): void;
  setSortedBoundary?(boundaryIndex: number): void;
  clearSortedBoundary?(): void;
  reset(): void;
};
type GoalPreview = {
  setData(values: number[]): void;
};
type PassTracker = {
  setCurrentPass(passNumber: number): void;
  setPassSwapCount(passNumber: number, count: number): void;
  setTailSize(size: number): void;
  reset(): void;
};
type SnapshotStrip = {
  addSnapshot(label: string, data: number[], sortedBoundary?: number): void;
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

const TRAIL_MAX = 4;

export const bubblesortProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as BarChart | undefined;
  const startPreview = views.startPreview as unknown as GoalPreview | undefined;
  // goalPreview 는 러너가 computeResult 로 직접 setData. projector 는 참조하지 않음.
  const passTracker = views.passTracker as unknown as PassTracker | undefined;
  const snapshotStrip = views.snapshotStrip as unknown as SnapshotStrip | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // 데이터 트래킹 (snapshot-strip 에 정확한 상태를 넘겨주기 위해)
  let currentValues: number[] = [];
  const sortedIndices = new Set<number>();
  let waveTrail: number[] = [];

  function resetState() {
    currentValues = [];
    sortedIndices.clear();
    waveTrail = [];
  }

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[] } | undefined;
      resetState();
      if (data?.values) {
        currentValues = [...data.values];
        stage?.setData(data.values);
        startPreview?.setData(data.values);
      }
      // goalPreview 는 러너가 computeResult 결과로 setData. 여기선 건드리지 않음.
    },

    async onEvent(event) {
      switch (event.type) {
        case 'pass-begin': {
          const p = event.payload as { passNumber?: number } | undefined;
          if (typeof p?.passNumber === 'number') {
            passTracker?.setCurrentPass(p.passNumber);
          }
          waveTrail = [];
          stage?.clearWaveTrail?.();
          stage?.clearRisingMarker?.();
          break;
        }

        case 'highlight': {
          if (!stage) break;
          const payload = event.payload as { kind?: string; positionInPass?: number } | undefined;
          if (payload?.kind === 'comparing' && typeof payload.positionInPass === 'number') {
            const j = payload.positionInPass;
            // 잔상은 이전까지 지나온 위치들
            stage.setWaveTrail?.(j, waveTrail.slice(-TRAIL_MAX));
            waveTrail.push(j);
            if (waveTrail.length > TRAIL_MAX + 1) waveTrail.shift();
          }
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
          if (
            payload?.kind === 'swap' &&
            typeof payload.i === 'number' &&
            typeof payload.j === 'number'
          ) {
            // 데이터 트래킹도 swap
            const i = payload.i, j = payload.j;
            [currentValues[i], currentValues[j]] = [currentValues[j], currentValues[i]];
            // 시각 swap (호 애니메이션). 러너는 onEvent 의 Promise 를 await.
            if (stage.swapItemsAnimated) {
              await stage.swapItemsAnimated(i, j, 80);
            } else {
              stage.swapItems(i, j);
            }
            if (!sortedIndices.has(i)) stage.setItemState(i, 'comparing');
            if (!sortedIndices.has(j)) stage.setItemState(j, 'comparing');
          }
          break;
        }

        case 'rising-move': {
          if (!stage) break;
          for (const i of toIndex(event.target)) {
            stage.setRisingMarker?.(i);
          }
          break;
        }

        case 'settle': {
          // mark + sorted-boundary 가 시각 확정을 담당. 추가 효과 없음.
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

        case 'pass-end': {
          const p = event.payload as
            | { passNumber?: number; swapCount?: number; sortedTailSize?: number }
            | undefined;
          if (typeof p?.passNumber === 'number' && typeof p?.swapCount === 'number') {
            passTracker?.setPassSwapCount(p.passNumber, p.swapCount);
          }
          if (typeof p?.sortedTailSize === 'number') {
            passTracker?.setTailSize(p.sortedTailSize);
            const boundaryIdx = currentValues.length - p.sortedTailSize;
            stage?.setSortedBoundary?.(boundaryIdx);
            snapshotStrip?.addSnapshot(`P${p.passNumber}`, currentValues, boundaryIdx);
          }
          stage?.clearRisingMarker?.();
          stage?.clearWaveTrail?.();
          waveTrail = [];
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase ?? null;
          codePanel?.highlightPhase(phase);
          break;
        }

        case 'done': {
          codePanel?.clearHighlight();
          stage?.clearRisingMarker?.();
          stage?.clearWaveTrail?.();
          stage?.setSortedBoundary?.(0); // 전체가 정렬됨
          break;
        }
      }
    },

    onReset() {
      // stage 의 visual reset 은 runner 가 reset 후 onInit 을 다시 호출해
      // setData 로 일괄 처리한다. 여기서는 보조 뷰만 정리.
      resetState();
      passTracker?.reset();
      snapshotStrip?.reset();
      codePanel?.clearHighlight();
    },
  };
};
