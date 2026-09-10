/**
 * dense-neighborhood projector — 번짐 이벤트를 들판과 거리 눈금의 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다 (C9). 화면 문안도 여기서 정해진다 —
 * algorithm 은 키조차 싣지 않고, 어느 걸음이 어떤 말을 할지는 이 층의 몫이다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import type {
  BlockedInput,
  DenseLink,
  IgniteInput,
  SpreadInput,
} from './dense-neighborhood-stage.js';

type DenseStage = {
  setCaption(text: string): void;
  rewind(): void;
  ignite(input: IgniteInput): Promise<void>;
  spread(input: SpreadInput): Promise<void>;
  blocked(input: BlockedInput): Promise<void>;
  finish(): Promise<void>;
};

function fields(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) return {};
  return payload as Record<string, unknown>;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function readLinks(v: unknown): DenseLink[] {
  if (!Array.isArray(v)) return [];
  const out: DenseLink[] = [];
  for (const item of v) {
    const f = fields(item);
    if (typeof f.from !== 'number' || typeof f.to !== 'number') continue;
    out.push({ from: f.from, to: f.to, dist: num(f.dist, 0) });
  }
  return out;
}

function readSizes(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((n): n is number => typeof n === 'number');
}

export const denseNeighborhoodProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as DenseStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const f = fields(event.payload);

      switch (event.type) {
        case 'rewind': {
          stage.rewind();
          return;
        }

        case 'ignite': {
          const cluster = num(f.cluster, 1);
          const input: IgniteInput = {
            index: num(f.index, 0),
            cluster,
            neighborCount: num(f.neighborCount, 0),
          };
          stage.setCaption(
            cluster === 1
              ? tr('caption.ignite', 'A spark here. Neighbours inside eps, itself included: {n}.', {
                  n: input.neighborCount,
                })
              : tr(
                  'caption.reignite',
                  'A new spark where the fire never reached. Neighbours inside eps: {n}.',
                  { n: input.neighborCount },
                ),
          );
          await stage.ignite(input);
          return;
        }

        case 'spread': {
          const rejected = typeof f.rejected === 'number' ? f.rejected : null;
          const input: SpreadInput = {
            cluster: num(f.cluster, 1),
            links: readLinks(f.links),
            rejected,
          };
          stage.setCaption(
            tr('caption.spread', 'The fire jumps to the neighbours of neighbours. In the group: {total}.', {
              total: num(f.total, 0),
            }),
          );
          await stage.spread(input);
          return;
        }

        case 'blocked': {
          const input: BlockedInput = {
            from: num(f.from, 0),
            to: num(f.to, 0),
            dist: num(f.dist, 0),
          };
          stage.setCaption(
            tr('caption.blocked', 'Nothing more inside eps. Distance to the nearest point outside: {d}.', {
              d: input.dist.toFixed(2),
            }),
          );
          await stage.blocked(input);
          return;
        }

        case 'done': {
          const sizes = readSizes(f.sizes);
          stage.setCaption(
            tr('caption.done', 'Groups the fire settled into: {k}. Sizes: {list}.', {
              k: sizes.length,
              list: sizes.join(', '),
            }),
          );
          await stage.finish();
          return;
        }

        default:
          // 위 다섯이 이 algorithm 이 내보내는 전부다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.rewind();
    },
  };
};
