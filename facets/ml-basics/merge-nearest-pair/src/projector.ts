/**
 * mergeNearestPair 의 번역기.
 *
 * algorithm 이 보내는 것은 무리 이름과 잰 거리뿐이고, 그것을 어디에 어떻게
 * 그릴지는 stage 가 정한다. 여기서 하는 일은 payload 를 좁혀 넘기는 것이다 (C9).
 */

import type { ProjectorFactory, ProjectorInstance, FacetRuntimeEvent } from '@ffacet/core/runtime';

import type { StageMerge } from './merge-nearest-pair-stage.js';

type MergeStage = {
  merge?(m: StageMerge): Promise<void> | void;
  finish?(): Promise<void> | void;
  rewind?(): void;
};

/** 무리쌍의 후보 선 — 거리를 실현한 점 두 개의 이름. */
function readLinks(value: unknown): { from: string; to: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { from: string; to: string }[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.from !== 'string' || typeof rec.to !== 'string') continue;
    out.push({ from: rec.from, to: rec.to });
  }
  return out;
}

function readMerge(payload: unknown): StageMerge | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.pickFrom !== 'string' || typeof p.pickTo !== 'string') return null;
  if (typeof p.leftId !== 'string' || typeof p.rightId !== 'string') return null;
  if (typeof p.nodeId !== 'string') return null;
  if (typeof p.height !== 'number' || !Number.isFinite(p.height)) return null;
  if (typeof p.remaining !== 'number') return null;
  return {
    links: readLinks(p.links),
    pickFrom: p.pickFrom,
    pickTo: p.pickTo,
    leftId: p.leftId,
    rightId: p.rightId,
    nodeId: p.nodeId,
    height: p.height,
    remaining: p.remaining,
  };
}

export const mergeNearestPairProjector: ProjectorFactory = (views): ProjectorInstance => {
  const stage = views.stage as unknown as MergeStage | undefined;

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'merge-rise': {
          const m = readMerge(event.payload);
          if (!m) return;
          await stage?.merge?.(m);
          return;
        }
        case 'done': {
          await stage?.finish?.();
          return;
        }
        case 'rewind': {
          stage?.rewind?.();
          return;
        }
        default:
          // 그 밖의 이벤트는 이 조각이 보내지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
