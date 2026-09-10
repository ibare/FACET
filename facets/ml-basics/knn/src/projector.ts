/**
 * k-최근접 이웃 Projector — algorithm 이벤트를 `knn-stage` 메서드 호출로 옮긴다.
 *
 * 이 파일은 번역기일 뿐이라 셈도 문안도 갖지 않는다 (원칙 1 · 5, C10). 좌표는
 * stage 가 셈하고, 화면에 뜨는 글은 stage 가 `params.t` 로 조회한다. 여기서
 * 하는 일은 payload 를 좁혀 (C9) 알맞은 메서드로 보내는 것뿐이다.
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';

/** stage view 가 노출하는 계약. 열린 `ViewInstance` 를 여기서 한 번 좁힌다 (C9). */
type KnnStage = {
  setBoundary?(input: {
    k: number;
    cells: number[];
    gridSize: number;
    aCells: number;
    cellTotal: number;
    flipped: number[];
    mislabeled: number[];
    prevK: number;
  }): void;
  beginQuery?(input: {
    index: number;
    total: number;
    x: number;
    y: number;
    ownLabel: number;
  }): void;
  showDistances?(dists: number[]): void;
  takeNeighbor?(input: { index: number; rank: number; radius: number; label: number }): void;
  castVote?(input: { votesA: number; votesB: number }): void;
  setVerdict?(input: {
    label: number;
    votesA: number;
    votesB: number;
    ownLabel: number;
  }): void;
  finish?(): void;
  clear?(): void;
};

/** code-view 가 노출하는 계약. */
type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

/** payload 를 필드별 `typeof` 로 거르기 위한 좁히개 (C9). */
function fields(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as Record<string, unknown>;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number');
}

export const knnProjector: ProjectorFactory = (views): ProjectorInstance => {
  const stage = views.stage as unknown as KnnStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  return {
    onEvent(event: FacetRuntimeEvent): void {
      const p = fields(event.payload);
      switch (event.type) {
        case 'phase': {
          const phase = p?.phase;
          codePanel?.highlightPhase?.(typeof phase === 'string' ? phase : null);
          return;
        }
        case 'boundary-drawn': {
          if (!p) return;
          stage?.setBoundary?.({
            k: num(p.k, 0),
            cells: numList(p.cells),
            gridSize: num(p.gridSize, 1),
            aCells: num(p.aCells, 0),
            cellTotal: num(p.cellTotal, 0),
            flipped: numList(p.flipped),
            mislabeled: numList(p.mislabeled),
            prevK: num(p.prevK, -1),
          });
          return;
        }
        case 'query-begin': {
          if (!p) return;
          stage?.beginQuery?.({
            index: num(p.index, 0),
            total: num(p.total, 1),
            x: num(p.x, 0),
            y: num(p.y, 0),
            ownLabel: num(p.ownLabel, -1),
          });
          return;
        }
        case 'distances-measured': {
          if (!p) return;
          stage?.showDistances?.(numList(p.dists));
          return;
        }
        case 'neighbor-taken': {
          if (!p) return;
          stage?.takeNeighbor?.({
            index: num(p.index, -1),
            rank: num(p.rank, 0),
            radius: num(p.radius, 0),
            label: num(p.label, 0),
          });
          return;
        }
        case 'vote-cast': {
          if (!p) return;
          stage?.castVote?.({ votesA: num(p.votesA, 0), votesB: num(p.votesB, 0) });
          return;
        }
        case 'verdict': {
          if (!p) return;
          stage?.setVerdict?.({
            label: num(p.label, 0),
            votesA: num(p.votesA, 0),
            votesB: num(p.votesB, 0),
            ownLabel: num(p.ownLabel, -1),
          });
          return;
        }
        case 'done': {
          stage?.finish?.();
          return;
        }
        default:
          // 이 algorithm 이 내지 않는 어휘다. 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      codePanel?.clearHighlight?.();
      stage?.clear?.();
    },
  };
};
