/**
 * siftUpProjector — algorithm.ts 의 이벤트를 sift-up-stage 메서드 호출로 번역한다.
 *
 * algorithm.ts 가 발신하는 이벤트 전부를 처리한다 (C2) — 'insert' / 'compare' /
 * 'swap' / 'settle' / 'rewind'. 캡션 문안은 `FacetJson.messages` 를 조회해
 * (C10) 완성된 문자열로 stage 에 넘긴다. stage 는 문안을 스스로 조회하지 않는다.
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** views.stage 의 구체 타입 — payload 를 좁힌 뒤 넘기는 경계 (C9). */
type SiftUpStage = {
  init?(values: unknown): void;
  insertNode?(index: number, value: number, caption: string): void | Promise<void>;
  compare?(childIndex: number, parentIndex: number, caption: string): void | Promise<void>;
  swapUp?(childIndex: number, parentIndex: number): void | Promise<void>;
  settle?(index: number, caption: string): void | Promise<void>;
  rewind?(): void | Promise<void>;
  destroy(): void;
};

export const siftUpProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SiftUpStage;
  // 러너 밖 mount 를 위한 fallback — 러너가 붙으면 항상 runtime.t 를 쓴다 (C10).
  const t = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown) {
      const d = initialData as { values?: unknown } | undefined;
      if (d && Array.isArray(d.values)) {
        stage.init?.(d.values);
      }
    },

    onEvent(event) {
      switch (event.type) {
        case 'insert': {
          const p = event.payload as { index?: number; value?: number } | undefined;
          if (typeof p?.index !== 'number' || typeof p?.value !== 'number') return;
          const caption = t(
            'caption.insert',
            'The new value {value} takes the last open slot.',
            { value: p.value },
          );
          return stage.insertNode?.(p.index, p.value, caption);
        }

        case 'compare': {
          const p = event.payload as
            | {
                childIndex?: number;
                parentIndex?: number;
                childValue?: number;
                parentValue?: number;
                precedes?: boolean;
              }
            | undefined;
          if (
            typeof p?.childIndex !== 'number' ||
            typeof p?.parentIndex !== 'number' ||
            typeof p?.childValue !== 'number' ||
            typeof p?.parentValue !== 'number' ||
            typeof p?.precedes !== 'boolean'
          ) {
            return;
          }
          const caption = p.precedes
            ? t(
                'caption.compareSwap',
                '{child} comes before its parent {parent} — they swap places.',
                { child: p.childValue, parent: p.parentValue },
              )
            : t(
                'caption.compareStop',
                '{child} does not come before its parent {parent} — it stops here.',
                { child: p.childValue, parent: p.parentValue },
              );
          return stage.compare?.(p.childIndex, p.parentIndex, caption);
        }

        case 'swap': {
          const p = event.payload as { childIndex?: number; parentIndex?: number } | undefined;
          if (typeof p?.childIndex !== 'number' || typeof p?.parentIndex !== 'number') return;
          return stage.swapUp?.(p.childIndex, p.parentIndex);
        }

        case 'settle': {
          const p = event.payload as { index?: number } | undefined;
          if (typeof p?.index !== 'number') return;
          const caption = t('caption.settle', 'This is its place.');
          return stage.settle?.(p.index, caption);
        }

        case 'rewind':
          return stage.rewind?.();

        default:
          // 알려지지 않은 확장 이벤트 — 조용히 무시 (C2 default 명시).
          return;
      }
    },

    onDestroy() {
      stage.destroy();
    },
  };
};
