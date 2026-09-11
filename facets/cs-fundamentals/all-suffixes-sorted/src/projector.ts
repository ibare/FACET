/**
 * all-suffixes-sorted projector — 걸음을 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). stage 는 이미 정형인 값만 받는다.
 * 문안은 키로만 남고 실제 글은 facet.ts 의 messages 에 있다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

type SuffixStage = {
  cutTails?(): Promise<void> | void;
  alignLeft?(): Promise<void> | void;
  takePlace?(spot: { from: number; rank: number }): Promise<void> | void;
  markCluster?(run: { ranks: number[]; prefix: string }): Promise<void> | void;
  setCaption?(text: string): void;
  reset?(): void;
};

type PlaceInfo = { from: number; rank: number; tail: string };
type ClusterInfo = { ranks: number[]; prefix: string };

function readPlace(payload: unknown): PlaceInfo | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.from !== 'number' || typeof p.rank !== 'number') return null;
  if (typeof p.tail !== 'string') return null;
  return { from: p.from, rank: p.rank, tail: p.tail };
}

function readCluster(payload: unknown): ClusterInfo | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.ranks) || typeof p.prefix !== 'string') return null;
  const ranks = p.ranks.filter((r): r is number => typeof r === 'number');
  return { ranks, prefix: p.prefix };
}

export const allSuffixesSortedProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as SuffixStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'cut-tails':
          stage?.setCaption?.(
            tr('caption.cutTails', 'Cut at every position — each cut leaves a tail.'),
          );
          await stage?.cutTails?.();
          return;

        case 'align-left':
          stage?.setCaption?.(
            tr('caption.alignLeft', 'Line up the left edges — now the tails can be compared.'),
          );
          await stage?.alignLeft?.();
          return;

        case 'take-place': {
          const spot = readPlace(event.payload);
          if (!spot) return;
          stage?.setCaption?.(tr('caption.takePlace', 'Next in line: {tail}', { tail: spot.tail }));
          await stage?.takePlace?.({ from: spot.from, rank: spot.rank });
          return;
        }

        case 'cluster': {
          const run = readCluster(event.payload);
          if (!run) return;
          stage?.setCaption?.(
            tr('caption.cluster', 'Tails that start alike now sit together — one stretch to search.'),
          );
          await stage?.markCluster?.(run);
          return;
        }

        case 'rewind':
          stage?.reset?.();
          return;

        default:
          // 이 조각이 쓰지 않는 이벤트는 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.reset?.();
    },
  };
};
