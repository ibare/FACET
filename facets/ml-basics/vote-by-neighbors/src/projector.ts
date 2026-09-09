/**
 * 최근접 이웃 투표 — projector.
 *
 * algorithm 의 이벤트를 stage 메서드 호출로 옮긴다. payload 는 `unknown` 이므로
 * 여기서 한 번 좁혀 정형 인자로 만들고, stage 는 좁혀진 것만 본다 (C9).
 * 화면 문안은 키로만 다루고 문장은 facet.ts 의 messages 에 있다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { ProjectorFactory, ProjectorInstance, ProjectorViews, ProjectorRuntime } from '@ffacet/core/runtime';

type VoteStage = {
  setCaption(text: string): void;
  showQuery(): Promise<void>;
  showRanking(order: number[]): Promise<void>;
  castVote(vote: {
    index: number;
    label: string;
    rank: number;
    distance: number;
    tally: number;
  }): Promise<void>;
  silence(indices: number[]): Promise<void>;
  declareWinner(winner: string): Promise<void>;
  reset(): void;
};

function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number');
}

export const voteByNeighborsProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views['stage'] as unknown as VoteStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(): void {
      stage?.reset();
    },

    onReset(): void {
      stage?.reset();
    },

    async onEvent(event): Promise<void> {
      if (!stage) return;

      switch (event.type) {
        case 'query-arrived': {
          stage.setCaption(
            tr('caption.arrive', 'A new point arrives with no label of its own.'),
          );
          await stage.showQuery();
          return;
        }

        case 'neighbors-ranked': {
          const p = event.payload as { order?: unknown } | undefined;
          stage.setCaption(
            tr('caption.ranked', 'Every neighbor is measured and lined up, nearest first.'),
          );
          await stage.showRanking(numberList(p?.order));
          return;
        }

        case 'voter-called': {
          const p = event.payload as
            | {
                index?: unknown;
                label?: unknown;
                rank?: unknown;
                distance?: unknown;
                tally?: unknown;
              }
            | undefined;
          if (
            typeof p?.index !== 'number' ||
            typeof p.label !== 'string' ||
            typeof p.rank !== 'number' ||
            typeof p.distance !== 'number' ||
            typeof p.tally !== 'number'
          ) {
            return;
          }
          stage.setCaption(
            tr(
              'caption.call',
              'Neighbor #{rank} is called out and drops a vote into box {label}.',
              { rank: p.rank, label: p.label },
            ),
          );
          await stage.castVote({
            index: p.index,
            label: p.label,
            rank: p.rank,
            distance: p.distance,
            tally: p.tally,
          });
          return;
        }

        case 'outsiders-silenced': {
          const p = event.payload as { indices?: unknown } | undefined;
          stage.setCaption(
            tr('caption.silenced', 'The rest cast nothing — for being far, and nothing else.'),
          );
          await stage.silence(numberList(p?.indices));
          return;
        }

        case 'done': {
          const p = event.payload as { winner?: unknown } | undefined;
          if (typeof p?.winner !== 'string') return;
          stage.setCaption(
            tr('caption.verdict', 'Box {winner} holds more votes. The new point is labeled {winner}.', {
              winner: p.winner,
            }),
          );
          await stage.declareWinner(p.winner);
          return;
        }

        case 'rewind': {
          stage.reset();
          return;
        }

        default:
          // 이 facet 이 내보내는 이벤트는 위가 전부다. 나머지는 조용히 버린다 (C2).
          return;
      }
    },
  };
};
