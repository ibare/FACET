/**
 * integer-overflow projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 하나도 여기 없다. 화면에 글자를 그리는 것은 stage 이고, stage 는
 * `params.t` 로 저작자 문안을 조회한다 (C10). 여기서는 수와 식별자만 넘긴다.
 *
 * `onInit` 이 첫 틀을 그린다. reactive 라 마운트 직후 알고리즘이 곧 `state-changed`
 * 를 보내지만, 그 한 틱 동안 화면이 비어 있지 않게 한다.
 */

import type { ProjectorFactory, FacetRuntimeEvent } from '@ffacet/core/runtime';
import { limitOf, type IntegerOverflowData } from './algorithm.js';

/** stage 가 내놓는 계약. 없는 메서드와도 견디도록 전부 optional 로 받는다 (C9). */
type OverflowStage = {
  setVessel?(width: number, limit: number, sequence: string, maxSteps: number): void;
  setStep?(index: number, value: number): void;
  setOverflow?(index: number, truth: number, wrapped: number): void;
  setDone?(survived: number): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

export const integerOverflowProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as OverflowStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;

  return {
    onInit(initialData: unknown) {
      const d = initialData as Partial<IntegerOverflowData> | undefined;
      const width = typeof d?.width === 'number' ? d.width : 0;
      const sequence = typeof d?.sequence === 'string' ? d.sequence : 'factorial';
      const maxSteps = typeof d?.maxSteps === 'number' ? d.maxSteps : 1;
      if (width > 0) stage?.setVessel?.(width, limitOf(width), sequence, maxSteps);
    },

    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          panel?.highlightPhase?.(typeof p?.phase === 'string' ? p.phase : null);
          return;
        }
        case 'state-changed': {
          const p = event.payload as
            | { width?: unknown; limit?: unknown; sequence?: unknown; maxSteps?: unknown }
            | undefined;
          if (
            typeof p?.width === 'number' &&
            typeof p.limit === 'number' &&
            typeof p.sequence === 'string' &&
            typeof p.maxSteps === 'number'
          ) {
            stage?.setVessel?.(p.width, p.limit, p.sequence, p.maxSteps);
          }
          return;
        }
        case 'append': {
          const p = event.payload as { index?: unknown; value?: unknown } | undefined;
          if (typeof p?.index === 'number' && typeof p.value === 'number') {
            stage?.setStep?.(p.index, p.value);
          }
          return;
        }
        case 'mark': {
          const p = event.payload as
            | { index?: unknown; truth?: unknown; wrapped?: unknown }
            | undefined;
          if (
            typeof p?.index === 'number' &&
            typeof p.truth === 'number' &&
            typeof p.wrapped === 'number'
          ) {
            stage?.setOverflow?.(p.index, p.truth, p.wrapped);
          }
          return;
        }
        case 'done': {
          const p = event.payload as { survived?: unknown } | undefined;
          stage?.setDone?.(typeof p?.survived === 'number' ? p.survived : 0);
          return;
        }
        default:
          // 그 밖의 이벤트는 이 facet 이 발신하지 않는다. 조용히 흘린다 (C2).
          return;
      }
    },

    onReset() {
      panel?.clearHighlight?.();
    },
  };
};
