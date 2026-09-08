/**
 * heapProperty projector — algorithm 의 확장 이벤트(C2 참조)를 heap-property-stage
 * 호출로 번역한다. payload 는 좁혀서 넘긴다 (C9).
 */

import type { ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';

/** heap-property-stage 가 노출하는 메서드 계약. cast 지점을 간결히 하려 상단에 끌어올린다 (C9). */
type HeapPropertyStage = {
  init?(nodes: { id: string; value: number }[]): void;
  reset?(): void;
  showPairCheck?(payload: {
    parentId: string;
    childId: string;
    parentValue: number;
    childValue: number;
    holds: boolean;
  }): Promise<void>;
  showSiblingSkip?(payload: { aId: string; bId: string; aValue: number; bValue: number }): Promise<void>;
  showConfirmed?(payload: { rootId: string; rootValue: number }): Promise<void>;
};

function isStageNode(v: unknown): v is { id: string; value: number } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { id?: unknown }).id === 'string' &&
    typeof (v as { value?: unknown }).value === 'number'
  );
}

export const heapPropertyProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as HeapPropertyStage;

  const onInit: ProjectorInstance['onInit'] = (initialData) => {
    const data = initialData as { nodes?: unknown } | undefined;
    const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const nodes = rawNodes.filter(isStageNode);
    stage.init?.(nodes);
  };

  const onReset: ProjectorInstance['onReset'] = () => {
    stage.reset?.();
  };

  const onEvent: ProjectorInstance['onEvent'] = async (event) => {
    switch (event.type) {
      case 'rewind': {
        stage.reset?.();
        return;
      }
      case 'heap-pair-check': {
        const p = event.payload as
          | { parentId?: unknown; childId?: unknown; parentValue?: unknown; childValue?: unknown; holds?: unknown }
          | undefined;
        if (
          typeof p?.parentId !== 'string' ||
          typeof p?.childId !== 'string' ||
          typeof p?.parentValue !== 'number' ||
          typeof p?.childValue !== 'number' ||
          typeof p?.holds !== 'boolean'
        ) {
          return;
        }
        await stage.showPairCheck?.({
          parentId: p.parentId,
          childId: p.childId,
          parentValue: p.parentValue,
          childValue: p.childValue,
          holds: p.holds,
        });
        return;
      }
      case 'heap-sibling-skip': {
        const p = event.payload as
          | { aId?: unknown; bId?: unknown; aValue?: unknown; bValue?: unknown }
          | undefined;
        if (
          typeof p?.aId !== 'string' ||
          typeof p?.bId !== 'string' ||
          typeof p?.aValue !== 'number' ||
          typeof p?.bValue !== 'number'
        ) {
          return;
        }
        await stage.showSiblingSkip?.({ aId: p.aId, bId: p.bId, aValue: p.aValue, bValue: p.bValue });
        return;
      }
      case 'heap-confirmed': {
        const p = event.payload as { rootId?: unknown; rootValue?: unknown } | undefined;
        if (typeof p?.rootId !== 'string' || typeof p?.rootValue !== 'number') return;
        await stage.showConfirmed?.({ rootId: p.rootId, rootValue: p.rootValue });
        return;
      }
      default:
        // 위 넷이 이 알고리즘이 발신하는 이벤트 전부다. 그 외는 조용히 무시한다.
        return;
    }
  };

  return { onInit, onReset, onEvent };
};
