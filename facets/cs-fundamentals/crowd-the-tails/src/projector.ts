/**
 * crowd-the-tails projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 를 그대로 넘기지 않는다. 여기서 정형 배열·수로 좁혀 넘기고 stage 는
 * 필수 필드 타입으로 받는다 (C9).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 내주는 계약. 없는 메서드에도 견디도록 전부 optional 로 받는다 (C9). */
type CrowdStage = {
  cutEvenly?(bounds: number[], counts: number[]): Promise<void>;
  cutByScale?(bounds: number[], counts: number[]): Promise<void>;
  fillPair?(
    left: number,
    right: number,
    leftCount: number,
    rightCount: number,
  ): Promise<void>;
  formDigest?(
    qs: number[],
    counts: number[],
    tailCount: number,
    middleCount: number,
    ratio: number,
  ): Promise<void>;
  rewind?(): void;
};

/** 수 배열만 남긴다. 수가 아닌 것은 버린다. */
function numbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export const crowdTheTailsProjector: ProjectorFactory = (
  views: ProjectorViews,
): ProjectorInstance => {
  const stage = views.stage as unknown as CrowdStage;

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      // 열린 타입을 한 번에 좁히고, 필드는 아래에서 하나씩 거른다 (C9).
      const p = event.payload as Record<string, unknown> | undefined;
      switch (event.type) {
        case 'cut-evenly':
          await stage.cutEvenly?.(numbers(p?.bounds), numbers(p?.counts));
          return;
        case 'cut-by-scale':
          await stage.cutByScale?.(numbers(p?.bounds), numbers(p?.counts));
          return;
        case 'fill-pair':
          await stage.fillPair?.(
            count(p?.left),
            count(p?.right),
            count(p?.leftCount),
            count(p?.rightCount),
          );
          return;
        case 'digest-formed':
          await stage.formDigest?.(
            numbers(p?.qs),
            numbers(p?.counts),
            count(p?.tailCount),
            count(p?.middleCount),
            count(p?.ratio),
          );
          return;
        case 'rewind':
          stage.rewind?.();
          return;
        default:
          // 그 밖의 이벤트는 이 조각이 그릴 것이 없다 — 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.rewind?.();
    },
  };
};
