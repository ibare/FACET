/**
 * 잡음점 조각의 번역기.
 *
 * algorithm 이 내는 걸음마다의 payload 를 좁혀 stage 메서드로 옮긴다 (C9).
 * 화면 문안은 여기서 `runtime.t` 로 조회한다 — algorithm 은 수만 싣고 문안은
 * 표현 계층의 일이다 (C10).
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type LeftOutItem = { index: number; x: number; y: number; neighbors: number };

type ClaimInfo = {
  index: number;
  cluster: number;
  dist: number;
  ratio: number;
  anchor: number;
  rank: number;
  total: number;
  remaining: number;
};

type Stage = {
  setCaption(text: string): void;
  placePoints(): Promise<void>;
  showRadius(counts: number[]): Promise<void>;
  markCores(core: number[], sparse: number[]): Promise<void>;
  spread(cluster: number, edges: [number, number][]): Promise<void>;
  haltSpread(border: { index: number; cluster: number }[]): Promise<void>;
  listLeftOut(items: LeftOutItem[]): Promise<void>;
  beginNearest(seeds: { x: number; y: number }[]): Promise<void>;
  settleCentroids(centroids: { x: number; y: number }[]): Promise<void>;
  claimStray(info: ClaimInfo): Promise<void>;
  rewind(): void;
};

function bag(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((n): n is number => typeof n === 'number') : [];
}

function pairs(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  const out: [number, number][] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) continue;
    if (typeof item[0] !== 'number' || typeof item[1] !== 'number') continue;
    out.push([item[0], item[1]]);
  }
  return out;
}

function points(value: unknown): { x: number; y: number }[] {
  if (!Array.isArray(value)) return [];
  const out: { x: number; y: number }[] = [];
  for (const item of value) {
    const p = bag(item);
    if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

function borderRows(value: unknown): { index: number; cluster: number }[] {
  if (!Array.isArray(value)) return [];
  const out: { index: number; cluster: number }[] = [];
  for (const item of value) {
    const b = bag(item);
    if (typeof b.index !== 'number' || typeof b.cluster !== 'number') continue;
    out.push({ index: b.index, cluster: b.cluster });
  }
  return out;
}

function leftOutRows(value: unknown): LeftOutItem[] {
  if (!Array.isArray(value)) return [];
  const out: LeftOutItem[] = [];
  for (const item of value) {
    const r = bag(item);
    if (typeof r.index !== 'number') continue;
    out.push({
      index: r.index,
      x: num(r.x),
      y: num(r.y),
      neighbors: num(r.neighbors),
    });
  }
  return out;
}

export const noiseLeftOutProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;
      const p = bag(event.payload);

      switch (event.type) {
        case 'rewind':
          stage.rewind();
          return;

        case 'points-placed':
          stage.setCaption(tr('caption.points', 'Sixteen points, one dataset, two methods.'));
          await stage.placePoints();
          return;

        case 'radius-shown':
          stage.setCaption(
            tr('caption.radius', 'Count the neighbors inside the radius. The core threshold is {m}.', {
              m: num(p.minPts),
            }),
          );
          await stage.showRadius(numbers(p.counts));
          return;

        case 'cores-marked': {
          const core = numbers(p.core);
          stage.setCaption(
            tr('caption.core', 'Points dense enough to be cores: {n}.', { n: core.length }),
          );
          await stage.markCores(core, numbers(p.sparse));
          return;
        }

        case 'spread-advanced':
          stage.setCaption(tr('caption.spread', 'A group spreads from core to core.'));
          await stage.spread(num(p.cluster), pairs(p.edges));
          return;

        case 'spread-halted': {
          const sizes = numbers(p.sizes);
          stage.setCaption(
            tr('caption.halted', 'The spread stops. Group sizes: {sizes}.', {
              sizes: sizes.join(' · '),
            }),
          );
          await stage.haltSpread(borderRows(p.border));
          return;
        }

        case 'left-out-listed': {
          const items = leftOutRows(p.items);
          stage.setCaption(
            tr('caption.leftOut', 'Nothing reached these. They stay where they are: {n}.', {
              n: items.length,
            }),
          );
          await stage.listLeftOut(items);
          return;
        }

        case 'nearest-begun':
          stage.setCaption(
            tr('caption.nearest', 'Same points. Now pick two centers and attach each to the nearer one.'),
          );
          await stage.beginNearest(points(p.seeds));
          return;

        case 'centroids-settled':
          stage.setCaption(
            tr('caption.centroids', 'The two centers settle. Rounds taken: {r}.', {
              r: num(p.rounds),
            }),
          );
          await stage.settleCentroids(points(p.centroids));
          return;

        case 'stray-claimed': {
          const info: ClaimInfo = {
            index: num(p.index),
            cluster: num(p.cluster),
            dist: num(p.dist),
            ratio: num(p.ratio),
            anchor: num(p.anchor),
            rank: num(p.rank),
            total: num(p.total),
            remaining: num(p.remaining),
          };
          // 거리 오름차순으로 오므로 마지막이 가장 먼 것이다. 그 한 걸음이 이
          // 조각의 논증이라 문안을 따로 쓴다.
          stage.setCaption(
            info.rank === info.total && info.total > 1
              ? tr('caption.claimFar', 'Far from every blob, yet it joins. Distance {d}, or {r} times eps.', {
                  d: info.dist.toFixed(2),
                  r: info.ratio.toFixed(1),
                })
              : tr('caption.claim', 'It joined a group whose nearest member sits {d} away.', {
                  d: info.dist.toFixed(2),
                }),
          );
          await stage.claimStray(info);
          return;
        }

        case 'done':
          stage.setCaption(
            tr('caption.done', 'Density left {a} out. The nearer side left {b} out.', {
              a: num(p.densityLeft),
              b: num(p.nearestLeft),
            }),
          );
          return;

        default:
          // 이 조각의 algorithm 은 위 어휘만 발신한다. 그 밖의 것은 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
