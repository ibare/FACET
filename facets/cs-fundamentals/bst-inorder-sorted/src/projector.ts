/**
 * bstInorderSortedProjector — algorithm.ts 의 이벤트를 stage 호출로 번역한다.
 *
 * algorithm.ts 상단 주석에 이벤트 어휘 전문이 있다. 이 파일은 그 어휘를
 * 전부 처리한다 (default 는 조용히 무시 — 실제로 발신되는 타입이 아니다).
 */

import { makeTranslator, parseTarget } from '@ffacet/core/runtime';
import type { Translate } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import type { BstInorderSortedData, BstInorderSortedNode } from './algorithm.js';
import type { BstInorderSortedStageInstance } from './bst-inorder-sorted-stage.js';

function nodeValueFromTarget(target: FacetRuntimeEvent['target']): number | null {
  if (typeof target !== 'string') return null;
  const parsed = parseTarget(target);
  if (!parsed || parsed.prefix !== 'node') return null;
  const value = Number(parsed.id);
  return Number.isFinite(value) ? value : null;
}

export const bstInorderSortedProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
) => {
  const stage = views.stage as unknown as BstInorderSortedStageInstance;
  const t: Translate = runtime?.t ?? makeTranslator();
  let total = 0;
  let outCount = 0;

  function caption(key: string, fallback: string, vars?: Record<string, string | number>): string {
    return t ? t(key, fallback, vars) : fallback;
  }

  return {
    onInit(initialData: unknown) {
      const data = initialData as Partial<BstInorderSortedData> | undefined;
      const nodes = Array.isArray(data?.nodes) ? (data.nodes as BstInorderSortedNode[]) : [];
      const rootValue = typeof data?.rootValue === 'number' ? data.rootValue : 0;
      total = nodes.length;
      outCount = 0;
      stage.setTree(nodes, rootValue);
    },

    onReset() {
      outCount = 0;
      stage.reset();
    },

    async onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'highlight': {
          const value = nodeValueFromTarget(event.target);
          if (value === null) return;
          stage.standAt(value);
          stage.setCaption(caption('caption.stand', '{value} stands — empty the left first.', { value }));
          return;
        }
        case 'unhighlight': {
          const value = nodeValueFromTarget(event.target);
          if (value === null) return;
          stage.leave(value);
          return;
        }
        case 'mark': {
          const value = nodeValueFromTarget(event.target);
          if (value === null) return;
          stage.settle(value);
          return;
        }
        case 'append': {
          const payload = event.payload as { value?: number } | undefined;
          const fromTarget = nodeValueFromTarget(event.target);
          const value = typeof payload?.value === 'number' ? payload.value : fromTarget;
          if (value === null) return;
          outCount += 1;
          await stage.flowOut(value);
          stage.setCaption(
            caption('caption.output', '{value} flows out — {n} placed so far.', { value, n: outCount }),
          );
          return;
        }
        case 'done': {
          stage.setCaption(caption('caption.done', 'All {n} are out, low to high.', { n: total }));
          return;
        }
        case 'rewind': {
          outCount = 0;
          stage.reset();
          return;
        }
        default:
          // algorithm.ts 가 발신하는 전부를 위에서 다뤘다 — 그 외는 조용히 무시 (C2).
          return;
      }
    },
  };
};
