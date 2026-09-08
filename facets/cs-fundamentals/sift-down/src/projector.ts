/**
 * sift-down projector — algorithm 이벤트를 sift-down-stage 뷰 메서드 호출로
 * 번역한다. 이벤트 어휘/payload 스키마는 algorithm.ts 상단 문서 참조 (C2).
 */

import {
  toIndexArray,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorViews,
} from '@ffacet/core/runtime';

/** sift-down-stage view 가 노출하는 메서드 계약 (C9 — payload 를 좁힌 뒤 넘긴다). */
type SiftDownStageView = {
  init(values: number[]): void;
  extract(index: number): void | Promise<void>;
  fill(from: number, to: number): void | Promise<void>;
  compare(parent: number, left: number, right: number | null, winner: number): void | Promise<void>;
  swap(a: number, b: number): void | Promise<void>;
  settle(index: number): void | Promise<void>;
  rewind(): void | Promise<void>;
};

function asStage(views: ProjectorViews): SiftDownStageView {
  return views.stage as unknown as SiftDownStageView;
}

export const siftDownProjector: ProjectorFactory = (views): ProjectorInstance => {
  const stage = asStage(views);

  return {
    onInit(initialData) {
      const data = initialData as { values?: unknown } | undefined;
      const values =
        Array.isArray(data?.values) && data.values.every((v) => typeof v === 'number')
          ? (data.values as number[])
          : [];
      stage.init(values);
    },

    async onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'extract': {
          const index = toIndexArray(event.target)[0];
          if (typeof index !== 'number') return;
          await stage.extract(index);
          return;
        }
        case 'fill': {
          const p = event.payload as { from?: unknown; to?: unknown } | undefined;
          if (typeof p?.from !== 'number' || typeof p?.to !== 'number') return;
          await stage.fill(p.from, p.to);
          return;
        }
        case 'compare': {
          const p = event.payload as
            | { parent?: unknown; left?: unknown; right?: unknown; winner?: unknown }
            | undefined;
          if (
            typeof p?.parent !== 'number' ||
            typeof p?.left !== 'number' ||
            typeof p?.winner !== 'number' ||
            (p?.right !== null && typeof p?.right !== 'number')
          ) {
            return;
          }
          await stage.compare(p.parent, p.left, p.right, p.winner);
          return;
        }
        case 'swap': {
          const p = event.payload as { a?: unknown; b?: unknown } | undefined;
          if (typeof p?.a !== 'number' || typeof p?.b !== 'number') return;
          await stage.swap(p.a, p.b);
          return;
        }
        case 'settle': {
          const p = event.payload as { index?: unknown } | undefined;
          if (typeof p?.index !== 'number') return;
          await stage.settle(p.index);
          return;
        }
        case 'rewind': {
          await stage.rewind();
          return;
        }
        default:
          // 그 외 이벤트는 이 조각의 어휘가 아니다 — 조용히 무시한다.
          return;
      }
    },
  };
};
